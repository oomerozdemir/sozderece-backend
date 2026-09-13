import prisma from "../utils/prisma.js";

// LGS/YKS ayrımı ayrı bir alan olarak tutulmuyor — grade bandından türetiliyor.
// 5-8. sınıf LGS, geri kalanı (9-12/Mezun/Üniversite/boş) YKS kabul edilir.
const LGS_GRADES = new Set(["5", "6", "7", "8"]);
export const effectiveTrackFromGrade = (grade) => (LGS_GRADES.has(String(grade || "")) ? "lgs" : "yks");

// "Bugün"/"bu hafta" hesapları öğrencinin takvim gününe (İstanbul, UTC+3,
// DST yok) göre yapılmalı — sunucunun kendi çalışma zaman dilimine (Render
// varsayılan UTC) göre DEĞİL. İkisi arasında her gece 00:00-03:00 İstanbul
// saatinde bir gün farkı oluşabiliyor; bu da hafta Pazar/Pazartesi sınırına
// denk geldiğinde koçun kaydettiği planın yanlış haftaya düşmesine yol
// açabiliyor (canlı testte doğrulandı). Bu yüzden `new Date().getDay()` gibi
// sunucu-yerel-saatine bağımlı metotlar yerine Intl ile İstanbul takvim
// gününü açıkça okuyoruz.
const TZ = "Europe/Istanbul";

const istanbulYMD = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  return { year: map.year, month: map.month, day: map.day };
};

// {year,month,day} İstanbul takvim gününün yerel 00:00'ına karşılık gelen
// UTC anı (İstanbul sabit UTC+3 -> yerel 00:00 = bir önceki günün 21:00 UTC'si).
const istanbulMidnightUTC = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));

// Pazartesi 00:00'a (İstanbul) normalize eder — StudyPlan.weekStart hep bu çapayla kaydediliyor/aranıyor.
export const toMondayStart = (dateInput) => {
  const { year, month, day } = istanbulYMD(dateInput);
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12)); // öğlen çapası: gün kayması riski yok
  const jsDay = noonUTC.getUTCDay(); // 0=Pazar..6=Cumartesi
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Pazartesi'ye git
  noonUTC.setUTCDate(noonUTC.getUTCDate() + diff);
  return istanbulMidnightUTC({ year: noonUTC.getUTCFullYear(), month: noonUTC.getUTCMonth() + 1, day: noonUTC.getUTCDate() });
};

const toDayStart = (dateInput) => istanbulMidnightUTC(istanbulYMD(dateInput));

// JS getDay(): 0=Pazar..6=Cumartesi -> StudyPlanItem.dayOfWeek'in
// kullandığı Pazartesi=0 tabanına çevirir. İstanbul takvim gününe göre.
export const todayDayOfWeek = () => {
  const { year, month, day } = istanbulYMD(new Date());
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return (jsDay + 6) % 7;
};

// Bir günün (plan + dayOfWeek) TÜM görevleri bir sonuca bağlandığında
// ("pending" kalmadığında) otomatik bir DayReport ("Z-Raporu") üretir/
// günceller. Veliye otomatik gönderim yok — sadece öğrenci/koç panelinde
// görünür (bkz. getConsentStats gibi diğer "iç görü" endpoint'leriyle
// aynı felsefe: önce görünür kıl, dağıtımı ayrı bir karar).
async function maybeGenerateDayReport(studentId, weekStart, dayOfWeek) {
  const plan = await prisma.studyPlan.findFirst({ where: { studentId, weekStart } });
  if (!plan) return;

  const dayItems = await prisma.studyPlanItem.findMany({ where: { studyPlanId: plan.id, dayOfWeek } });
  if (dayItems.length === 0 || dayItems.some((i) => i.status === "pending")) return;

  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);

  const doneTasks = dayItems.filter((i) => i.status === "done").length;
  const partialTasks = dayItems.filter((i) => i.status === "partial").length;
  const stuckTasks = dayItems.filter((i) => i.status === "stuck").length;
  const totalMinutes = dayItems.reduce((sum, i) => (i.status === "done" ? sum + (i.durationMin || 0) : sum), 0);

  await prisma.dayReport.upsert({
    where: { studentId_date: { studentId, date } },
    update: { totalTasks: dayItems.length, doneTasks, partialTasks, stuckTasks, totalMinutes },
    create: { studentId, date, totalTasks: dayItems.length, doneTasks, partialTasks, stuckTasks, totalMinutes },
  });
}

/**
 * GET /api/v1/ogrenci/me/study-plan?weekStart=YYYY-MM-DD
 * Belirtilmezse bu haftanın programı döner.
 */
export const getMyStudyPlan = async (req, res) => {
  try {
    const studentId = req.user.id;
    const weekStart = toMondayStart(req.query.weekStart);

    const plan = await prisma.studyPlan.findFirst({
      where: { studentId, weekStart },
      include: { items: { orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }] } },
    });

    res.json({ success: true, weekStart, plan });
  } catch (err) {
    console.error("getMyStudyPlan:", err);
    res.status(500).json({ success: false, message: "Program alınamadı." });
  }
};

const VALID_STATUSES = ["pending", "done", "partial", "stuck"];

/**
 * PATCH /api/v1/ogrenci/me/study-plan/items/:id/status
 * Öğrenci görevini işaretler: "done" (Bitti), "partial" (Yarıda Kaldı),
 * "stuck" (Zorlandım) ya da "pending"e geri alır. Günün tüm görevleri bir
 * sonuca bağlanınca otomatik Z-Raporu üretir.
 */
export const setStudyPlanItemStatus = async (req, res) => {
  try {
    const studentId = req.user.id;
    const itemId = parseInt(req.params.id);
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum." });
    }

    const item = await prisma.studyPlanItem.findUnique({
      where: { id: itemId },
      include: { studyPlan: { select: { studentId: true, weekStart: true } } },
    });
    if (!item || item.studyPlan.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Görev bulunamadı." });
    }

    const updated = await prisma.studyPlanItem.update({
      where: { id: itemId },
      data: { status, statusAt: status === "pending" ? null : new Date() },
    });

    await maybeGenerateDayReport(studentId, item.studyPlan.weekStart, item.dayOfWeek);

    res.json({ success: true, item: updated });
  } catch (err) {
    console.error("setStudyPlanItemStatus:", err);
    res.status(500).json({ success: false, message: "Görev güncellenemedi." });
  }
};

/**
 * GET /api/v1/ogrenci/me/today
 * Panelin varsayılan karşılama ekranı için: SADECE bugünün görevleri +
 * varsa bugüne ait Z-Raporu. Bilerek haftanın tamamını döndürmüyor —
 * öğrenci girer girmez devasa bir listeyle karşılaşıp strese girmesin.
 */
export const getMyToday = async (req, res) => {
  try {
    const studentId = req.user.id;
    const weekStart = toMondayStart(new Date());
    const dayOfWeek = todayDayOfWeek();
    const date = toDayStart(new Date());

    const plan = await prisma.studyPlan.findFirst({ where: { studentId, weekStart } });
    const items = plan
      ? await prisma.studyPlanItem.findMany({ where: { studyPlanId: plan.id, dayOfWeek }, orderBy: { order: "asc" } })
      : [];
    const report = await prisma.dayReport.findUnique({ where: { studentId_date: { studentId, date } } }).catch(() => null);

    res.json({ success: true, date, items, report });
  } catch (err) {
    console.error("getMyToday:", err);
    res.status(500).json({ success: false, message: "Bugünün programı alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/exam-results
 * Deneme geçmişi, tarih artan sırada (trend grafiği için).
 */
export const getMyExamResults = async (req, res) => {
  try {
    const results = await prisma.examResult.findMany({
      where: { studentId: req.user.id },
      orderBy: { examDate: "asc" },
    });
    res.json({ success: true, results });
  } catch (err) {
    console.error("getMyExamResults:", err);
    res.status(500).json({ success: false, message: "Deneme sonuçları alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/resources
 * Öğrencinin sınıf/türüne uygun, gizli olmayan kaynaklar.
 */
export const getMyResources = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { grade: true } });
    const track = effectiveTrackFromGrade(user?.grade);

    const resources = await prisma.resource.findMany({
      where: {
        hidden: false,
        AND: [
          { OR: [{ targetTrack: null }, { targetTrack: track }] },
          { OR: [{ targetGrade: null }, { targetGrade: user?.grade || "__none__" }] },
        ],
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    });

    res.json({ success: true, resources });
  } catch (err) {
    console.error("getMyResources:", err);
    res.status(500).json({ success: false, message: "Kaynaklar alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/announcements
 * Süresi geçmemiş, gizli olmayan, sınıf/türüne uygun duyurular.
 */
export const getMyAnnouncements = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { grade: true } });
    const track = effectiveTrackFromGrade(user?.grade);
    const now = new Date();

    const announcements = await prisma.announcement.findMany({
      where: {
        hidden: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          { OR: [{ targetTrack: null }, { targetTrack: track }] },
          { OR: [{ targetGrade: null }, { targetGrade: user?.grade || "__none__" }] },
        ],
      },
      orderBy: { publishedAt: "desc" },
    });

    res.json({ success: true, announcements });
  } catch (err) {
    console.error("getMyAnnouncements:", err);
    res.status(500).json({ success: false, message: "Duyurular alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/summary
 * "Genel Bakış" sekmesi için tek istekte tüm özet veri: toplam/haftalık
 * çalışma süresi, bugünün odağı, son aktiviteler (tamamlanan görev +
 * eklenen deneme, birleşik zaman çizelgesi) ve bir "koçun seni ne kadar
 * tanıyor" göstergesi (profil + program + deneme geçmişi doluluğu).
 */
export const getMySummary = async (req, res) => {
  try {
    const studentId = req.user.id;
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { grade: true, track: true, assignedCoachId: true },
    });

    const [allPlans, examResults] = await Promise.all([
      prisma.studyPlan.findMany({ where: { studentId }, include: { items: true } }),
      prisma.examResult.findMany({ where: { studentId }, orderBy: { examDate: "desc" } }),
    ]);

    const currentWeekStart = toMondayStart(new Date());
    const currentPlan = allPlans.find((p) => p.weekStart.getTime() === currentWeekStart.getTime());

    let totalMinutesCompleted = 0;
    let weeklyMinutesCompleted = 0;
    const activity = [];

    let weeklyStuckCount = 0;
    for (const plan of allPlans) {
      const isCurrentWeek = plan.weekStart.getTime() === currentWeekStart.getTime();
      for (const item of plan.items) {
        if (item.status === "done") {
          const mins = item.durationMin || 0;
          totalMinutesCompleted += mins;
          if (isCurrentWeek) weeklyMinutesCompleted += mins;
          if (item.statusAt) {
            activity.push({ type: "task", label: `${item.subject}${item.topic ? ` — ${item.topic}` : ""}`, at: item.statusAt });
          }
        } else if (isCurrentWeek && item.status === "stuck") {
          weeklyStuckCount += 1;
        }
      }
    }
    for (const r of examResults) {
      activity.push({ type: "exam", label: `${r.examName}${r.totalNet != null ? ` (${r.totalNet} net)` : ""}`, at: r.createdAt });
    }
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    const weeklyTaskTotal = currentPlan?.items?.length || 0;
    const weeklyTaskDone = currentPlan?.items?.filter((i) => i.status === "done").length || 0;

    // JS getDay(): 0=Pazar..6=Cumartesi -> Pazartesi=0 tabanına çevir
    const todayDow = (new Date().getDay() + 6) % 7;
    const todayFocus = (currentPlan?.items || [])
      .filter((i) => i.dayOfWeek === todayDow && i.status === "pending")
      .sort((a, b) => a.order - b.order);

    const latestExam = examResults[0] || null;
    const prevExam = examResults[1] || null;
    const netTrendDelta =
      latestExam?.totalNet != null && prevExam?.totalNet != null
        ? Number((latestExam.totalNet - prevExam.totalNet).toFixed(2))
        : null;

    // Koçun seni ne kadar tanıyor göstergesi — 3 basit doluluk sinyali.
    const profileScore = student?.assignedCoachId ? (student?.grade ? 100 : 70) : 20;
    const programScore = weeklyTaskTotal > 0 ? Math.round((weeklyTaskDone / weeklyTaskTotal) * 100) : 0;
    const denemeScore = Math.min(100, Math.round((examResults.length / 5) * 100));
    const overallScore = Math.round((profileScore + programScore + denemeScore) / 3);

    res.json({
      success: true,
      totalMinutesCompleted,
      weeklyMinutesCompleted,
      weeklyTaskDone,
      weeklyTaskTotal,
      examCount: examResults.length,
      latestExam,
      netTrendDelta,
      todayFocus,
      weeklyStuckCount,
      recentActivity: activity.slice(0, 8),
      quality: {
        profile: profileScore,
        program: programScore,
        deneme: denemeScore,
        overall: overallScore,
        stars: Math.max(1, Math.round(overallScore / 20)),
      },
    });
  } catch (err) {
    console.error("getMySummary:", err);
    res.status(500).json({ success: false, message: "Özet alınamadı." });
  }
};
