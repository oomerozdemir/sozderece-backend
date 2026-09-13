import prisma from "../utils/prisma.js";

// LGS/YKS ayrımı ayrı bir alan olarak tutulmuyor — grade bandından türetiliyor.
// 5-8. sınıf LGS, geri kalanı (9-12/Mezun/Üniversite/boş) YKS kabul edilir.
const LGS_GRADES = new Set(["5", "6", "7", "8"]);
export const effectiveTrackFromGrade = (grade) => (LGS_GRADES.has(String(grade || "")) ? "lgs" : "yks");

// Pazartesi 00:00'a normalize eder — StudyPlan.weekStart hep bu çapayla kaydediliyor/aranıyor.
export const toMondayStart = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = d.getDay(); // 0=Pazar..6=Cumartesi
  const diff = day === 0 ? -6 : 1 - day; // Pazartesi'ye git
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

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

/**
 * PATCH /api/v1/ogrenci/me/study-plan/items/:id/complete
 * Öğrenci kendi görev kutucuğunu işaretler/kaldırır.
 */
export const toggleStudyPlanItem = async (req, res) => {
  try {
    const studentId = req.user.id;
    const itemId = parseInt(req.params.id);
    const { completed } = req.body;

    const item = await prisma.studyPlanItem.findUnique({
      where: { id: itemId },
      include: { studyPlan: { select: { studentId: true } } },
    });
    if (!item || item.studyPlan.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Görev bulunamadı." });
    }

    const isCompleted = completed === true || completed === "true";
    const updated = await prisma.studyPlanItem.update({
      where: { id: itemId },
      data: { completed: isCompleted, completedAt: isCompleted ? new Date() : null },
    });

    res.json({ success: true, item: updated });
  } catch (err) {
    console.error("toggleStudyPlanItem:", err);
    res.status(500).json({ success: false, message: "Görev güncellenemedi." });
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

    for (const plan of allPlans) {
      const isCurrentWeek = plan.weekStart.getTime() === currentWeekStart.getTime();
      for (const item of plan.items) {
        if (item.completed) {
          const mins = item.durationMin || 0;
          totalMinutesCompleted += mins;
          if (isCurrentWeek) weeklyMinutesCompleted += mins;
          if (item.completedAt) {
            activity.push({ type: "task", label: `${item.subject}${item.topic ? ` — ${item.topic}` : ""}`, at: item.completedAt });
          }
        }
      }
    }
    for (const r of examResults) {
      activity.push({ type: "exam", label: `${r.examName}${r.totalNet != null ? ` (${r.totalNet} net)` : ""}`, at: r.createdAt });
    }
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    const weeklyTaskTotal = currentPlan?.items?.length || 0;
    const weeklyTaskDone = currentPlan?.items?.filter((i) => i.completed).length || 0;

    // JS getDay(): 0=Pazar..6=Cumartesi -> Pazartesi=0 tabanına çevir
    const todayDow = (new Date().getDay() + 6) % 7;
    const todayFocus = (currentPlan?.items || [])
      .filter((i) => i.dayOfWeek === todayDow && !i.completed)
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
