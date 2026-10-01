import prisma from "../utils/prisma.js";
import { EXAM_TYPES, computeExamAggregates, validateExamResultPayload } from "../utils/examCalculations.js";
import { toMondayStart, toDayStart, todayDayOfWeek } from "../utils/istanbulTime.js";

export { toMondayStart, toDayStart, todayDayOfWeek };

// Bir LIVE denemenin "bitmemiş" sayıldığı durumlar — üçü de aynı derecede
// "devam eden deneme" kabul edilir (yalnızca IN_PROGRESS değil).
const ACTIVE_LIVE_STATUSES = ["IN_PROGRESS", "RESULT_PENDING", "ANALYSIS_PENDING"];

// LGS/YKS ayrımı ayrı bir alan olarak tutulmuyor — grade bandından türetiliyor.
// 5-8. sınıf LGS, geri kalanı (9-12/Mezun/Üniversite/boş) YKS kabul edilir.
const LGS_GRADES = new Set(["5", "6", "7", "8"]);
export const effectiveTrackFromGrade = (grade) => (LGS_GRADES.has(String(grade || "")) ? "lgs" : "yks");

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
  const actualStudyMinutes = await sumActualStudyMinutes(studentId, date);

  await prisma.dayReport.upsert({
    where: { studentId_date: { studentId, date } },
    update: { totalTasks: dayItems.length, doneTasks, partialTasks, stuckTasks, totalMinutes, actualStudyMinutes },
    create: { studentId, date, totalTasks: dayItems.length, doneTasks, partialTasks, stuckTasks, totalMinutes, actualStudyMinutes },
  });
}

// O İstanbul takvim gününde (date = o günün 00:00'ı) tamamlanan Pomodoro
// turlarının GERÇEK süresini (saniye->dakika) toplar. Planlanan durationMin
// değil, öğrencinin fiilen kronometreyle çalıştığı süre.
export async function sumActualStudyMinutes(studentId, date) {
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const sessions = await prisma.pomodoroSession.findMany({
    where: { studentId, startedAt: { gte: date, lt: dayEnd }, actualSeconds: { not: null } },
    select: { actualSeconds: true },
  });
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.actualSeconds || 0), 0);
  return Math.round(totalSeconds / 60);
}

// Pomodoro turu durdurulduğunda, o gün için Z-Raporu ZATEN oluşmuşsa (tüm
// görevler sonuçlanmışsa) gerçek çalışma süresini tazeler — rapor
// oluşmadıysa hiçbir şey yapmaz (erken oluşturmuyoruz, görev tamamlanma
// koşulu maybeGenerateDayReport'ta zaten var).
async function syncDayReportActualMinutes(studentId, date) {
  const existing = await prisma.dayReport.findUnique({ where: { studentId_date: { studentId, date } } });
  if (!existing) return;
  const actualStudyMinutes = await sumActualStudyMinutes(studentId, date);
  await prisma.dayReport.update({ where: { id: existing.id }, data: { actualStudyMinutes } });
}

// "Ateş Serisi" — bir gün, o günün Z-Raporu'nda görevlerin %90'ı ve üzeri
// "done" ise sayılır. Bugünün raporu henüz yoksa (gün bitmedi) bu, seriyi
// BOZMAZ — dünden geriye doğru saymaya devam eder (Duolingo'daki gibi,
// gün bitene kadar seri "donuk" kalır).
export async function computeStreak(studentId) {
  const reports = await prisma.dayReport.findMany({ where: { studentId }, orderBy: { date: "desc" } });
  if (reports.length === 0) return { current: 0, longest: 0 };

  const qualifies = (r) => r.totalTasks > 0 && r.doneTasks / r.totalTasks >= 0.9;
  const byTime = new Map(reports.map((r) => [r.date.getTime(), r]));

  const cursor = toDayStart(new Date());
  if (!byTime.has(cursor.getTime())) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while (true) {
    const r = byTime.get(cursor.getTime());
    if (r && qualifies(r)) {
      current += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else break;
  }

  const sortedAsc = [...reports].sort((a, b) => a.date - b.date);
  let longest = 0, run = 0, prevTime = null;
  for (const r of sortedAsc) {
    if (qualifies(r)) {
      run = prevTime !== null && r.date.getTime() - prevTime === 86400000 ? run + 1 : 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    prevTime = r.date.getTime();
  }

  return { current, longest: Math.max(longest, current) };
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
const VALID_FEELINGS = ["kolay", "normal", "zor"];
const VALID_NOT_COMPLETED_REASONS = [
  "Vaktim yetmedi",
  "Konu zor geldi",
  "Okul/kurstan dolayı yetişmedi",
  "Motivasyonum düşüktü",
  "Diğer",
];

/**
 * PATCH /api/v1/ogrenci/me/study-plan/items/:id/status
 * Öğrenci görevini işaretler: "done" (Bitti), "partial" (Yarıda Kaldı),
 * "stuck" (Zorlandım/Bugün Yapamadım) ya da "pending"e geri alır. Günün tüm
 * görevleri bir sonuca bağlanınca otomatik Z-Raporu üretir.
 * Body: { status, feeling?, note?, notCompletedReason? }
 * - feeling: sadece status="done" iken anlamlı ("kolay"|"normal"|"zor").
 * - notCompletedReason: sadece status="stuck" iken anlamlı, "Bugün
 *   Yapamadım" akışından gelir.
 */
export const setStudyPlanItemStatus = async (req, res) => {
  try {
    const studentId = req.user.id;
    const itemId = parseInt(req.params.id);
    const { status, feeling, note, notCompletedReason } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum." });
    }
    if (feeling != null && !VALID_FEELINGS.includes(feeling)) {
      return res.status(400).json({ success: false, message: "Geçersiz geri bildirim." });
    }
    if (notCompletedReason != null && !VALID_NOT_COMPLETED_REASONS.includes(notCompletedReason)) {
      return res.status(400).json({ success: false, message: "Geçersiz sebep." });
    }

    const item = await prisma.studyPlanItem.findUnique({
      where: { id: itemId },
      include: { studyPlan: { select: { studentId: true, weekStart: true } } },
    });
    if (!item || item.studyPlan.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Görev bulunamadı." });
    }

    const data = { status, statusAt: status === "pending" ? null : new Date() };
    if (status === "pending") {
      data.feeling = null;
      data.notCompletedReason = null;
    } else {
      if (status === "done") data.feeling = feeling ?? null;
      if (status === "stuck") data.notCompletedReason = notCompletedReason ?? null;
      if (note !== undefined) data.note = String(note || "").trim().slice(0, 500) || null;
    }

    const updated = await prisma.studyPlanItem.update({ where: { id: itemId }, data });

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
    const rawItems = plan
      ? await prisma.studyPlanItem.findMany({
          where: { studyPlanId: plan.id, dayOfWeek },
          orderBy: { order: "asc" },
          include: { pomodoroSessions: { where: { actualSeconds: { not: null } }, select: { actualSeconds: true } } },
        })
      : [];
    // Görev kartında "gerçekte kaç dakika çalışıldı" göstermek için — kronometre
    // dahilinde geçen bütün turların toplamı (item.durationMin planlanan süre,
    // bu ise fiilen kronometreyle ölçülen süre).
    const items = rawItems.map(({ pomodoroSessions, ...it }) => ({
      ...it,
      actualMinutes: Math.round(pomodoroSessions.reduce((sum, s) => sum + (s.actualSeconds || 0), 0) / 60),
    }));
    const report = await prisma.dayReport.findUnique({ where: { studentId_date: { studentId, date } } }).catch(() => null);
    const activePomodoro = await prisma.pomodoroSession.findFirst({ where: { studentId, endedAt: null } });
    const actualStudyMinutesToday = await sumActualStudyMinutes(studentId, date);
    const streak = await computeStreak(studentId);

    // Boş durum mesajını doğru seçebilmek için: koç bu hafta için bir program
    // hazırlamış mı (o zaman bugünün boş olması bilinçli bir "dinlenme günü"
    // olabilir) yoksa hiç program yok mu (henüz hazırlanmadı) ayrımı.
    res.json({ success: true, date, items, report, activePomodoro, actualStudyMinutesToday, streak, hasWeekPlan: !!plan });
  } catch (err) {
    console.error("getMyToday:", err);
    res.status(500).json({ success: false, message: "Bugünün programı alınamadı." });
  }
};

/**
 * POST /api/v1/ogrenci/me/pomodoro/start
 * Body: { studyPlanItemId?: number }
 * Yeni bir Pomodoro turu (25dk) başlatır. Zaten aktif bir tur varsa (sayfa
 * yenilenmiş olabilir) onu döner — aynı anda tek tur olur.
 */
export const startPomodoro = async (req, res) => {
  try {
    const studentId = req.user.id;
    const existing = await prisma.pomodoroSession.findFirst({ where: { studentId, endedAt: null } });
    if (existing) return res.json({ success: true, session: existing });

    const studyPlanItemId = req.body?.studyPlanItemId ? parseInt(req.body.studyPlanItemId) : null;
    const session = await prisma.pomodoroSession.create({
      data: { studentId, studyPlanItemId, plannedSeconds: 1500 },
    });
    res.status(201).json({ success: true, session });
  } catch (err) {
    console.error("startPomodoro:", err);
    res.status(500).json({ success: false, message: "Pomodoro başlatılamadı." });
  }
};

/**
 * PATCH /api/v1/ogrenci/me/pomodoro/:id/stop
 * Body: { completed?: boolean } — 25dk'yı doldurup mu durdu yoksa erken mi
 * bırakıldı. Gerçek süre sunucuda (startedAt->şimdi) hesaplanır; istemcinin
 * gönderdiği süreye güvenilmez.
 */
export const stopPomodoro = async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const session = await prisma.pomodoroSession.findUnique({ where: { id } });
    if (!session || session.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Tur bulunamadı." });
    }
    if (session.endedAt) {
      return res.json({ success: true, session }); // zaten durmuş, idempotent
    }

    const now = new Date();
    const actualSeconds = Math.max(0, Math.round((now - session.startedAt) / 1000));
    const completed = !!req.body?.completed || actualSeconds >= session.plannedSeconds;

    const updated = await prisma.pomodoroSession.update({
      where: { id },
      data: { endedAt: now, actualSeconds, completed },
    });

    await syncDayReportActualMinutes(studentId, toDayStart(session.startedAt));

    res.json({ success: true, session: updated });
  } catch (err) {
    console.error("stopPomodoro:", err);
    res.status(500).json({ success: false, message: "Pomodoro durdurulamadı." });
  }
};

/**
 * POST /api/v1/ogrenci/me/sos
 * Body: { message?: string }
 * Öğrenci kriz anında tek tuşla bir SosAlert oluşturur — koç panelinde
 * anında görünür. WhatsApp'a gitmek istemci tarafında ayrıca yapılır (bu
 * endpoint sadece panel-içi görünürlüğü sağlar).
 */
export const createSosAlert = async (req, res) => {
  try {
    const studentId = req.user.id;
    const message = (req.body?.message || "").trim().slice(0, 500) || null;
    const alert = await prisma.sosAlert.create({ data: { studentId, message } });
    res.status(201).json({ success: true, alert });
  } catch (err) {
    console.error("createSosAlert:", err);
    res.status(500).json({ success: false, message: "SOS gönderilemedi." });
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
 * GET /api/v1/ogrenci/me/exam-results/active
 * Devam eden (bitmemiş) bir LIVE deneme var mı — varsa döner. Üç durum da
 * (IN_PROGRESS/RESULT_PENDING/ANALYSIS_PENDING) "bitmemiş" sayılır; frontend
 * dönen `status`'e göre timer/sonuç-formu/analiz adımından hangisine
 * devam edeceğine karar verir.
 */
export const getMyActiveExam = async (req, res) => {
  try {
    const exam = await prisma.examResult.findFirst({
      where: { studentId: req.user.id, entryMode: "LIVE", status: { in: ACTIVE_LIVE_STATUSES } },
    });
    res.json({ success: true, exam: exam || null });
  } catch (err) {
    console.error("getMyActiveExam:", err);
    res.status(500).json({ success: false, message: "Aktif deneme kontrol edilemedi." });
  }
};

/**
 * POST /api/v1/ogrenci/me/exam-results/live/start
 * Body: { examName, examType, branch?, totalQuestions?, targetNet?, targetDurationMinutes?, focusAreas? }
 * Aynı öğrencinin aynı anda birden fazla aktif LIVE denemesi olamaz — DB'de
 * kısmi unique index bunu garanti ediyor (bkz. migration). Önce iyimser bir
 * findFirst ile hızlı yol denenir; iki eşzamanlı istek yarışırsa create'in
 * ihlal ettiği kısıt Prisma P2002 hatası olarak geri döner, bu durumda aktif
 * deneme yeniden sorgulanıp idempotent olarak döndürülür — asla iki satır
 * oluşmaz.
 */
export const startLiveExam = async (req, res) => {
  try {
    const studentId = req.user.id;
    const existing = await prisma.examResult.findFirst({
      where: { studentId, entryMode: "LIVE", status: { in: ACTIVE_LIVE_STATUSES } },
    });
    if (existing) return res.json({ success: true, exam: existing });

    const { examName, examType, branch, totalQuestions, targetNet, targetDurationMinutes, focusAreas } = req.body || {};
    if (!examName || !String(examName).trim()) {
      return res.status(400).json({ success: false, message: "Deneme adı zorunlu." });
    }
    if (!EXAM_TYPES.includes(examType)) {
      return res.status(400).json({ success: false, message: "Geçersiz deneme türü." });
    }
    if (examType === "BRANS" && (!branch || !String(branch).trim())) {
      return res.status(400).json({ success: false, message: "Branş denemesi için ders seçilmeli." });
    }

    try {
      const now = new Date();
      const exam = await prisma.examResult.create({
        data: {
          studentId,
          examName: String(examName).trim().slice(0, 200),
          examType,
          examDate: now,
          branch: branch ? String(branch).trim().slice(0, 100) : null,
          totalQuestions: totalQuestions != null ? parseInt(totalQuestions) : null,
          targetNet: targetNet != null && targetNet !== "" ? parseFloat(targetNet) : null,
          targetDurationMinutes: targetDurationMinutes != null && targetDurationMinutes !== "" ? parseInt(targetDurationMinutes) : null,
          focusAreas: Array.isArray(focusAreas) ? focusAreas : undefined,
          subjectNets: [],
          entryMode: "LIVE",
          status: "IN_PROGRESS",
          // startedAt sunucuda üretilen `now`dan set edilir — MANUAL satırlar
          // startedAt=null kalmalı diye şemada @default(now()) YOK (varsayılan
          // her satıra uygulanırdı); client'tan asla kabul edilmez, PomodoroSession
          // ile aynı güven seviyesi, yalnızca DB-default yerine app-level.
          startedAt: now,
        },
      });
      return res.status(201).json({ success: true, exam });
    } catch (createErr) {
      if (createErr?.code === "P2002") {
        // Yarış durumu: eşzamanlı bir istek araya girdi. Kısmi unique index
        // ihlali — aktif denemeyi yeniden sorgulayıp idempotent dön.
        const raced = await prisma.examResult.findFirst({
          where: { studentId, entryMode: "LIVE", status: { in: ACTIVE_LIVE_STATUSES } },
        });
        if (raced) return res.json({ success: true, exam: raced });
      }
      throw createErr;
    }
  } catch (err) {
    console.error("startLiveExam:", err);
    res.status(500).json({ success: false, message: "Deneme başlatılamadı." });
  }
};

/**
 * PATCH /api/v1/ogrenci/me/exam-results/:id/finish
 * Gerçek süre sunucuda (startedAt->şimdi) hesaplanır; istemcinin gönderdiği
 * süreye güvenilmez (Pomodoro'daki stopPomodoro ile aynı desen).
 */
export const finishLiveExam = async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const exam = await prisma.examResult.findUnique({ where: { id } });
    if (!exam || exam.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Deneme bulunamadı." });
    }
    if (exam.entryMode !== "LIVE") {
      return res.status(400).json({ success: false, message: "Bu deneme canlı zamanlayıcı ile başlatılmamış." });
    }
    if (exam.status !== "IN_PROGRESS") {
      return res.json({ success: true, exam }); // zaten bitmiş, idempotent
    }

    const now = new Date();
    const durationSeconds = Math.max(0, Math.round((now - exam.startedAt) / 1000));
    const updated = await prisma.examResult.update({
      where: { id },
      data: { finishedAt: now, durationSeconds, status: "RESULT_PENDING" },
    });
    res.json({ success: true, exam: updated });
  } catch (err) {
    console.error("finishLiveExam:", err);
    res.status(500).json({ success: false, message: "Deneme bitirilemedi." });
  }
};

/**
 * PATCH /api/v1/ogrenci/me/exam-results/:id/results
 * Body: { subjectNets: [{subject, questionCount?, correct, wrong, blank}] }
 * Netler her zaman sunucuda yeniden hesaplanır (utils/examCalculations.js) —
 * client'ın gönderdiği net değerine güvenilmez.
 */
export const submitExamResults = async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const exam = await prisma.examResult.findUnique({ where: { id } });
    if (!exam || exam.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Deneme bulunamadı." });
    }

    if (exam.status === "IN_PROGRESS") {
      return res.status(400).json({ success: false, message: "Önce denemeyi bitirmelisin." });
    }

    const { subjectNets } = req.body || {};
    const validation = validateExamResultPayload(subjectNets, exam.totalQuestions);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const user = await prisma.user.findUnique({ where: { id: studentId }, select: { grade: true } });
    const studentTrack = effectiveTrackFromGrade(user?.grade);
    const aggregates = computeExamAggregates(subjectNets, exam.examType, studentTrack);

    const nextStatus = exam.status === "ANALYSIS_PENDING" || exam.status === "COMPLETED" ? exam.status : "ANALYSIS_PENDING";
    const updated = await prisma.examResult.update({
      where: { id },
      data: {
        subjectNets: aggregates.subjectNets,
        totalCorrect: aggregates.totalCorrect,
        totalWrong: aggregates.totalWrong,
        totalBlank: aggregates.totalBlank,
        totalNet: aggregates.totalNet,
        status: nextStatus,
      },
    });
    res.json({ success: true, exam: updated });
  } catch (err) {
    console.error("submitExamResults:", err);
    res.status(500).json({ success: false, message: "Sonuçlar kaydedilemedi." });
  }
};

/**
 * PATCH /api/v1/ogrenci/me/exam-results/:id/analysis
 * Body: { difficultyReasons?, didWell?, nextImprovement?, studentNote? }
 */
export const submitExamSelfAnalysis = async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const exam = await prisma.examResult.findUnique({ where: { id } });
    if (!exam || exam.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Deneme bulunamadı." });
    }
    if (exam.status === "COMPLETED") {
      return res.json({ success: true, exam }); // zaten tamamlanmış, idempotent
    }
    if (exam.status !== "ANALYSIS_PENDING") {
      return res.status(400).json({ success: false, message: "Önce deneme sonuçlarını girmelisin." });
    }

    const { difficultyReasons, didWell, nextImprovement, studentNote } = req.body || {};
    const updated = await prisma.examResult.update({
      where: { id },
      data: {
        difficultyReasons: Array.isArray(difficultyReasons) ? difficultyReasons : undefined,
        didWell: didWell != null ? String(didWell).trim().slice(0, 1000) || null : undefined,
        nextImprovement: nextImprovement != null ? String(nextImprovement).trim().slice(0, 1000) || null : undefined,
        studentNote: studentNote != null ? String(studentNote).trim().slice(0, 1000) || null : undefined,
        status: "COMPLETED",
      },
    });
    res.json({ success: true, exam: updated });
  } catch (err) {
    console.error("submitExamSelfAnalysis:", err);
    res.status(500).json({ success: false, message: "Analiz kaydedilemedi." });
  }
};

/**
 * POST /api/v1/ogrenci/me/exam-results/manual
 * Timer kullanılmadan geçmiş bir denemenin tek seferde eklenmesi. Sonuçlar
 * zorunlu (subjectNets); hedef/süre/öz-analiz opsiyonel. Öz analiz aynı
 * istekte verildiyse status doğrudan COMPLETED, verilmediyse ANALYSIS_PENDING.
 */
export const createManualExamResult = async (req, res) => {
  try {
    const studentId = req.user.id;
    const {
      examName, examType, branch, examDate, totalQuestions,
      subjectNets, durationMinutes, targetNet, targetDurationMinutes, focusAreas,
      difficultyReasons, didWell, nextImprovement, studentNote,
    } = req.body || {};

    if (!examName || !String(examName).trim()) {
      return res.status(400).json({ success: false, message: "Deneme adı zorunlu." });
    }
    if (!EXAM_TYPES.includes(examType)) {
      return res.status(400).json({ success: false, message: "Geçersiz deneme türü." });
    }
    if (examType === "BRANS" && (!branch || !String(branch).trim())) {
      return res.status(400).json({ success: false, message: "Branş denemesi için ders seçilmeli." });
    }
    const validation = validateExamResultPayload(subjectNets, totalQuestions != null ? parseInt(totalQuestions) : null);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const user = await prisma.user.findUnique({ where: { id: studentId }, select: { grade: true } });
    const studentTrack = effectiveTrackFromGrade(user?.grade);
    const aggregates = computeExamAggregates(subjectNets, examType, studentTrack);

    const hasAnalysis = !!(didWell || nextImprovement || studentNote || (Array.isArray(difficultyReasons) && difficultyReasons.length));

    const exam = await prisma.examResult.create({
      data: {
        studentId,
        examName: String(examName).trim().slice(0, 200),
        examType,
        examDate: examDate ? new Date(examDate) : new Date(),
        branch: branch ? String(branch).trim().slice(0, 100) : null,
        totalQuestions: totalQuestions != null ? parseInt(totalQuestions) : null,
        entryMode: "MANUAL",
        durationSeconds: durationMinutes != null && durationMinutes !== "" ? Math.round(parseFloat(durationMinutes) * 60) : null,
        targetNet: targetNet != null && targetNet !== "" ? parseFloat(targetNet) : null,
        targetDurationMinutes: targetDurationMinutes != null && targetDurationMinutes !== "" ? parseInt(targetDurationMinutes) : null,
        focusAreas: Array.isArray(focusAreas) ? focusAreas : undefined,
        subjectNets: aggregates.subjectNets,
        totalCorrect: aggregates.totalCorrect,
        totalWrong: aggregates.totalWrong,
        totalBlank: aggregates.totalBlank,
        totalNet: aggregates.totalNet,
        difficultyReasons: Array.isArray(difficultyReasons) ? difficultyReasons : undefined,
        didWell: didWell ? String(didWell).trim().slice(0, 1000) : null,
        nextImprovement: nextImprovement ? String(nextImprovement).trim().slice(0, 1000) : null,
        studentNote: studentNote ? String(studentNote).trim().slice(0, 1000) : null,
        status: hasAnalysis ? "COMPLETED" : "ANALYSIS_PENDING",
      },
    });
    res.status(201).json({ success: true, exam });
  } catch (err) {
    console.error("createManualExamResult:", err);
    res.status(500).json({ success: false, message: "Deneme eklenemedi." });
  }
};

/**
 * GET /api/v1/ogrenci/me/exam-results/:id
 * Tek deneme detayı — yalnızca kendi kaydıysa döner.
 */
export const getMyExamResultDetail = async (req, res) => {
  try {
    const studentId = req.user.id;
    const id = parseInt(req.params.id);
    const exam = await prisma.examResult.findUnique({ where: { id } });
    if (!exam || exam.studentId !== studentId) {
      return res.status(404).json({ success: false, message: "Deneme bulunamadı." });
    }
    res.json({ success: true, exam });
  } catch (err) {
    console.error("getMyExamResultDetail:", err);
    res.status(500).json({ success: false, message: "Deneme alınamadı." });
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
    const streak = await computeStreak(req.user.id);

    res.json({ success: true, resources, streak });
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

    const todayDow = todayDayOfWeek();
    const todayFocus = (currentPlan?.items || [])
      .filter((i) => i.dayOfWeek === todayDow && i.status === "pending")
      .sort((a, b) => a.order - b.order);

    const latestExam = examResults[0] || null;
    const prevExam = examResults[1] || null;
    const netTrendDelta =
      latestExam?.totalNet != null && prevExam?.totalNet != null
        ? Number((latestExam.totalNet - prevExam.totalNet).toFixed(2))
        : null;

    // Panelin "Son Denemem" kartı için — en son iki deneme arasında ders
    // bazında net değişimi (Matematik +3.25 gibi). İki deneme de aynı dersi
    // içermiyorsa o ders atlanır.
    const subjectNetDeltas = (() => {
      const latestSubjects = Array.isArray(latestExam?.subjectNets) ? latestExam.subjectNets : [];
      const prevSubjects = Array.isArray(prevExam?.subjectNets) ? prevExam.subjectNets : [];
      if (!latestSubjects.length || !prevSubjects.length) return [];
      const prevBySubject = new Map(prevSubjects.map((s) => [s.subject, s.net]));
      return latestSubjects
        .filter((s) => prevBySubject.has(s.subject) && s.net != null)
        .map((s) => ({ subject: s.subject, delta: Number((s.net - prevBySubject.get(s.subject)).toFixed(2)) }));
    })();

    // "Bu Hafta" kartındaki "Tamamlanan Konu" metriği — bu hafta "mastered"
    // seviyesine geçirilen konu sayısı.
    const topicsMasteredThisWeek = await prisma.topicMastery.count({
      where: { studentId, stage: "mastered", updatedAt: { gte: currentWeekStart } },
    });

    // Koçun seni ne kadar tanıyor göstergesi — 3 basit doluluk sinyali.
    const profileScore = student?.assignedCoachId ? (student?.grade ? 100 : 70) : 20;
    const programScore = weeklyTaskTotal > 0 ? Math.round((weeklyTaskDone / weeklyTaskTotal) * 100) : 0;
    const denemeScore = Math.min(100, Math.round((examResults.length / 5) * 100));
    const overallScore = Math.round((profileScore + programScore + denemeScore) / 3);

    const streak = await computeStreak(studentId);
    // "Dijital koç" avatarının ifadesi için — son aktiviteden bu yana kaç
    // gün geçti (0 = bugün aktif oldu).
    const daysSinceLastActivity = activity[0]
      ? Math.floor((toDayStart(new Date()) - toDayStart(activity[0].at)) / 86400000)
      : null;

    res.json({
      success: true,
      totalMinutesCompleted,
      weeklyMinutesCompleted,
      streak,
      daysSinceLastActivity,
      weeklyTaskDone,
      weeklyTaskTotal,
      examCount: examResults.length,
      latestExam,
      netTrendDelta,
      subjectNetDeltas,
      topicsMasteredThisWeek,
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

/* ────────────────────────── Konu Takip Ağacı ────────────────────────── */

const MASTERY_STAGES = ["none", "studied", "practiced", "mastered"];
const nextMasteryStage = (current) => {
  const i = MASTERY_STAGES.indexOf(current);
  return MASTERY_STAGES[(i + 1) % MASTERY_STAGES.length];
};

/**
 * GET /api/v1/ogrenci/me/topics
 * Öğrencinin track'ine (yks/lgs) uygun tüm konular + bu öğrencinin her
 * konudaki ustalık seviyesi ("none" varsayılan, hiç işaretlenmemişse).
 */
export const getMyTopics = async (req, res) => {
  try {
    const studentId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: studentId }, select: { grade: true } });
    const track = effectiveTrackFromGrade(user?.grade);

    const [topics, masteries] = await Promise.all([
      prisma.topic.findMany({ where: { track, hidden: false }, orderBy: [{ examType: "asc" }, { subject: "asc" }, { order: "asc" }] }),
      prisma.topicMastery.findMany({ where: { studentId } }),
    ]);

    const stageByTopicId = new Map(masteries.map((m) => [m.topicId, m.stage]));
    const withStage = topics.map((t) => ({ ...t, stage: stageByTopicId.get(t.id) || "none" }));

    res.json({ success: true, track, topics: withStage });
  } catch (err) {
    console.error("getMyTopics:", err);
    res.status(500).json({ success: false, message: "Konular alınamadı." });
  }
};

/**
 * PATCH /api/v1/ogrenci/me/topics/:topicId/mastery
 * Body: { stage? } — verilirse doğrudan o seviyeye ayarlar, verilmezse bir
 * sonraki seviyeye ilerletir (none->studied->practiced->mastered->none).
 */
export const setTopicMastery = async (req, res) => {
  try {
    const studentId = req.user.id;
    const topicId = parseInt(req.params.topicId);
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ success: false, message: "Konu bulunamadı." });

    let stage = req.body?.stage;
    if (stage && !MASTERY_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: "Geçersiz seviye." });
    }
    if (!stage) {
      const existing = await prisma.topicMastery.findUnique({ where: { studentId_topicId: { studentId, topicId } } });
      stage = nextMasteryStage(existing?.stage || "none");
    }

    const mastery = await prisma.topicMastery.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      update: { stage },
      create: { studentId, topicId, stage },
    });

    res.json({ success: true, mastery });
  } catch (err) {
    console.error("setTopicMastery:", err);
    res.status(500).json({ success: false, message: "Konu güncellenemedi." });
  }
};

/* ────────────────────────── Akıllı Deneme Analizi ────────────────────────── */

// Son 3 deneme arasında en az 2 kez yanlış işaretlenen konuları bulur —
// "tekrar eden hata" tespiti. wrongTopicIds hiç girilmemiş (eski) sınavlar
// sessizce atlanır. Zaten "mastered" işaretlenmiş konular hariç tutulur.
export async function detectRecurringWeaknesses(studentId) {
  const recentExams = await prisma.examResult.findMany({
    where: { studentId },
    orderBy: { examDate: "desc" },
    take: 3,
  });

  const countByTopicId = new Map();
  let checkedExams = 0;
  for (const exam of recentExams) {
    const subjectNets = Array.isArray(exam.subjectNets) ? exam.subjectNets : [];
    const hasTopicData = subjectNets.some((s) => Array.isArray(s.wrongTopicIds) && s.wrongTopicIds.length > 0);
    if (!hasTopicData) continue;
    checkedExams += 1;
    const seenInThisExam = new Set();
    for (const s of subjectNets) {
      for (const id of s.wrongTopicIds || []) {
        if (seenInThisExam.has(id)) continue; // aynı sınavda bir konu bir kez sayılsın
        seenInThisExam.add(id);
        countByTopicId.set(id, (countByTopicId.get(id) || 0) + 1);
      }
    }
  }

  const candidateIds = [...countByTopicId.entries()].filter(([, count]) => count >= 2).map(([id]) => id);
  if (candidateIds.length === 0) return [];

  const [topics, masteries] = await Promise.all([
    prisma.topic.findMany({ where: { id: { in: candidateIds } } }),
    prisma.topicMastery.findMany({ where: { studentId, topicId: { in: candidateIds }, stage: "mastered" } }),
  ]);
  const masteredIds = new Set(masteries.map((m) => m.topicId));

  return topics
    .filter((t) => !masteredIds.has(t.id))
    .map((t) => ({ topicId: t.id, topicName: t.name, subject: t.subject, count: countByTopicId.get(t.id), checkedExams }))
    .sort((a, b) => b.count - a.count);
}

/**
 * GET /api/v1/ogrenci/me/insights
 * "Son N denemede tekrar eden hata" uyarıları — öğrenci görünümü.
 */
export const getMyInsights = async (req, res) => {
  try {
    const insights = await detectRecurringWeaknesses(req.user.id);
    res.json({ success: true, insights });
  } catch (err) {
    console.error("getMyInsights:", err);
    res.status(500).json({ success: false, message: "İçgörüler alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/notes/latest
 * Koçun bıraktığı en güncel yazılı/sesli not — panelin en üstünde sabit
 * gösterilecek "günlük çapa". isToday: bugün mü bırakıldı, yoksa eski mi.
 */
export const getMyLatestNote = async (req, res) => {
  try {
    const studentId = req.user.id;
    const note = await prisma.coachNote.findFirst({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: { student: { select: { assignedCoach: { select: { name: true } } } } },
    });
    if (!note) return res.json({ success: true, note: null });

    const todayStart = toDayStart(new Date());
    const isToday = toDayStart(note.createdAt).getTime() === todayStart.getTime();

    res.json({
      success: true,
      note: {
        id: note.id,
        type: note.type,
        text: note.text,
        audioUrl: note.audioUrl,
        createdAt: note.createdAt,
        coachName: note.student?.assignedCoach?.name || "Koçun",
        isToday,
      },
    });
  } catch (err) {
    console.error("getMyLatestNote:", err);
    res.status(500).json({ success: false, message: "Not alınamadı." });
  }
};
