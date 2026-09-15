import prisma from "../utils/prisma.js";
import { toMondayStart, todayDayOfWeek, toDayStart, detectRecurringWeaknesses, effectiveTrackFromGrade, computeStreak, sumActualStudyMinutes } from "./studentPanel.controller.js";


export const getAssignedStudents = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Koç profili kontrolü
    const coach = await prisma.coach.findUnique({
      where: { userId },
    });

    if (!coach) {
      return res.status(404).json({ message: "Koç profili bulunamadı." });
    }

    // 2️⃣ Öğrencileri ve her biri için son siparişi al
    const students = await prisma.user.findMany({
      where: {
        assignedCoachId: coach.id,
        role: "student",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        grade: true,
        track: true,
        orders: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // sadece en son sipariş
          select: {
            package: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    // "Anlık görür" + "Kolay takip": roster kartında modalı açmadan görünecek
    // her şeyi burada, mümkün olduğunca az ek sorguyla topluyoruz — koç
    // 10-20 öğrencisine tek bakışta göz gezdirip kimin peşine düşeceğini
    // anlasın.
    const studentIds = students.map((s) => s.id);
    const weekStart = toMondayStart(new Date());
    const dayOfWeek = todayDayOfWeek();
    const todayDate = toDayStart(new Date());
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);

    // Bugünün TÜM görevleri (durum farketmeksizin) — hem stuck/partial
    // rozetlerini hem de "3/5 tamamlandı" ilerleme oranını aynı sorgudan
    // türetiyoruz.
    const todayItemsAll = studentIds.length
      ? await prisma.studyPlanItem.findMany({
          where: { dayOfWeek, studyPlan: { studentId: { in: studentIds }, weekStart } },
          select: { status: true, studyPlan: { select: { studentId: true } } },
        })
      : [];
    const stuckSet = new Set(todayItemsAll.filter((i) => i.status === "stuck").map((i) => i.studyPlan.studentId));
    const partialSet = new Set(todayItemsAll.filter((i) => i.status === "partial").map((i) => i.studyPlan.studentId));
    const todayProgressById = new Map();
    for (const item of todayItemsAll) {
      const sid = item.studyPlan.studentId;
      const cur = todayProgressById.get(sid) || { done: 0, total: 0 };
      cur.total += 1;
      if (item.status === "done") cur.done += 1;
      todayProgressById.set(sid, cur);
    }

    // Bugünün gerçek çalışma süresi (Pomodoro) — tek gruplu sorgu.
    const pomodoroToday = studentIds.length
      ? await prisma.pomodoroSession.groupBy({
          by: ["studentId"],
          where: { studentId: { in: studentIds }, startedAt: { gte: todayDate, lt: tomorrowDate }, actualSeconds: { not: null } },
          _sum: { actualSeconds: true },
        })
      : [];
    const actualMinutesById = new Map(pomodoroToday.map((p) => [p.studentId, Math.round((p._sum.actualSeconds || 0) / 60)]));

    // Ateş serisi + tekrar eden hata sayısı — küçük roster için öğrenci
    // başına ayrı sorgu kabul edilebilir (sınıf büyüklüğünde N, N+1 sorgu
    // maliyeti düşük).
    const [streaks, weaknesses] = await Promise.all([
      Promise.all(studentIds.map((id) => computeStreak(id))),
      Promise.all(studentIds.map((id) => detectRecurringWeaknesses(id))),
    ]);
    const streakById = new Map(studentIds.map((id, i) => [id, streaks[i]]));
    const weaknessCountById = new Map(studentIds.map((id, i) => [id, weaknesses[i].length]));

    const withFlags = students.map((s) => ({
      ...s,
      strugglingToday: stuckSet.has(s.id),
      partialToday: partialSet.has(s.id),
      streak: streakById.get(s.id) || { current: 0, longest: 0 },
      todayProgress: todayProgressById.get(s.id) || { done: 0, total: 0 },
      actualStudyMinutesToday: actualMinutesById.get(s.id) || 0,
      recurringWeaknessCount: weaknessCountById.get(s.id) || 0,
    }));

    res.status(200).json({ students: withFlags });
  } catch (error) {
    console.error("Koç öğrencileri getirme hatası:", error);
    res.status(500).json({ message: "Öğrenciler getirilemedi." });
  }
};


export const getAllPublicCoaches = async (req, res) => {
  try {
    const coaches = await prisma.coach.findMany({
      select: {
        id: true,
        name: true,
        subject: true,
        description: true,
        image: true,
      },
    });

    res.status(200).json(coaches);
  } catch (error) {
    console.error("Koçlar alınamadı:");
    res.status(500).json({ error: "Koçlar alınamadı." });
  }
};

// Bu koça atanmış öğrenci mi? — öğrenci paneli endpoint'lerinde tekrar tekrar
// kullanılan sahiplik kontrolü tek yerden.
const assertOwnStudent = async (coachUserId, studentId) => {
  const coach = await prisma.coach.findUnique({ where: { userId: coachUserId } });
  if (!coach) return null;
  const student = await prisma.user.findFirst({
    where: { id: studentId, assignedCoachId: coach.id, role: "student" },
    select: { id: true },
  });
  return student ? coach : null;
};

/**
 * GET /api/coach/students/:studentId/study-plan?weekStart=YYYY-MM-DD
 * POST /api/coach/students/:studentId/study-plan
 * Koç, atanmış bir öğrencinin haftalık programını görüntüler/oluşturur-üzerine yazar.
 */
export const getStudentStudyPlanForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const weekStart = toMondayStart(req.query.weekStart);
    const plan = await prisma.studyPlan.findFirst({
      where: { studentId, weekStart },
      include: { items: { orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }] } },
    });
    res.json({ success: true, weekStart, plan });
  } catch (error) {
    console.error("getStudentStudyPlanForCoach:", error);
    res.status(500).json({ success: false, message: "Program alınamadı." });
  }
};

export const upsertStudentStudyPlan = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const { weekStart: rawWeekStart, title, items } = req.body;
    const weekStart = toMondayStart(rawWeekStart);
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "items dizisi zorunludur." });
    }

    const existing = await prisma.studyPlan.findFirst({ where: { studentId, weekStart } });

    const plan = existing
      ? await prisma.studyPlan.update({
          where: { id: existing.id },
          data: {
            title: title || null,
            items: {
              deleteMany: {}, // basit ve doğru: haftayı yeniden yaz
              create: items.map((it, i) => ({
                dayOfWeek: it.dayOfWeek,
                subject: it.subject,
                topic: it.topic || null,
                durationMin: it.durationMin ? parseInt(it.durationMin) : null,
                order: it.order ?? i,
              })),
            },
          },
          include: { items: { orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }] } },
        })
      : await prisma.studyPlan.create({
          data: {
            studentId,
            weekStart,
            title: title || null,
            createdById: req.user.id,
            items: {
              create: items.map((it, i) => ({
                dayOfWeek: it.dayOfWeek,
                subject: it.subject,
                topic: it.topic || null,
                durationMin: it.durationMin ? parseInt(it.durationMin) : null,
                order: it.order ?? i,
              })),
            },
          },
          include: { items: { orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }] } },
        });

    res.json({ success: true, plan });
  } catch (error) {
    console.error("upsertStudentStudyPlan:", error);
    res.status(500).json({ success: false, message: "Program kaydedilemedi." });
  }
};

/**
 * GET /api/coach/students/:studentId/exam-results
 * POST /api/coach/students/:studentId/exam-results
 */
export const getStudentExamResultsForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const results = await prisma.examResult.findMany({ where: { studentId }, orderBy: { examDate: "desc" } });
    res.json({ success: true, results });
  } catch (error) {
    console.error("getStudentExamResultsForCoach:", error);
    res.status(500).json({ success: false, message: "Deneme sonuçları alınamadı." });
  }
};

export const addStudentExamResult = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const { examDate, examName, examType, subjectNets, totalNet, ranking, notes } = req.body;
    if (!examDate || !examName || !examType) {
      return res.status(400).json({ success: false, message: "Sınav tarihi, adı ve türü zorunludur." });
    }

    const result = await prisma.examResult.create({
      data: {
        studentId,
        examDate: new Date(examDate),
        examName,
        examType,
        subjectNets: Array.isArray(subjectNets) ? subjectNets : [],
        totalNet: totalNet !== undefined && totalNet !== "" ? parseFloat(totalNet) : null,
        ranking: ranking !== undefined && ranking !== "" ? parseInt(ranking) : null,
        notes: notes || null,
        enteredById: req.user.id,
      },
    });

    res.status(201).json({ success: true, result });
  } catch (error) {
    console.error("addStudentExamResult:", error);
    res.status(500).json({ success: false, message: "Deneme sonucu eklenemedi." });
  }
};

/**
 * GET /api/coach/students/:studentId/today
 * Koç, öğrencinin bugünkü görevlerini ve durumlarını (Bitti/Yarıda Kaldı/
 * Zorlandım/Bekliyor) anlık görür — "nerede takıldığını" anlamak için.
 */
export const getStudentTodayForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const weekStart = toMondayStart(new Date());
    const dayOfWeek = todayDayOfWeek();
    const plan = await prisma.studyPlan.findFirst({ where: { studentId, weekStart } });
    const items = plan
      ? await prisma.studyPlanItem.findMany({ where: { studyPlanId: plan.id, dayOfWeek }, orderBy: { order: "asc" } })
      : [];
    const actualStudyMinutesToday = await sumActualStudyMinutes(studentId, toDayStart(new Date()));

    res.json({ success: true, items, actualStudyMinutesToday });
  } catch (error) {
    console.error("getStudentTodayForCoach:", error);
    res.status(500).json({ success: false, message: "Bugünün durumu alınamadı." });
  }
};

/**
 * GET /api/coach/sos-alerts
 * Koçun öğrencilerinden gelen, henüz çözülmemiş SOS bildirimleri — en
 * yeniden eskiye. Panel açılır açılmaz görünsün diye ayrı, hafif bir uç.
 */
export const getSosAlertsForCoach = async (req, res) => {
  try {
    const coach = await prisma.coach.findUnique({ where: { userId: req.user.id } });
    if (!coach) return res.status(404).json({ success: false, message: "Koç profili bulunamadı." });

    const alerts = await prisma.sosAlert.findMany({
      where: { resolvedAt: null, student: { assignedCoachId: coach.id } },
      include: { student: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, alerts });
  } catch (error) {
    console.error("getSosAlertsForCoach:", error);
    res.status(500).json({ success: false, message: "SOS bildirimleri alınamadı." });
  }
};

/**
 * PATCH /api/coach/sos-alerts/:id/resolve
 */
export const resolveSosAlert = async (req, res) => {
  try {
    const coach = await prisma.coach.findUnique({ where: { userId: req.user.id } });
    if (!coach) return res.status(404).json({ success: false, message: "Koç profili bulunamadı." });

    const id = parseInt(req.params.id);
    const alert = await prisma.sosAlert.findUnique({ where: { id }, include: { student: { select: { assignedCoachId: true } } } });
    if (!alert || alert.student.assignedCoachId !== coach.id) {
      return res.status(404).json({ success: false, message: "Bildirim bulunamadı." });
    }

    const updated = await prisma.sosAlert.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: req.user.id },
    });
    res.json({ success: true, alert: updated });
  } catch (error) {
    console.error("resolveSosAlert:", error);
    res.status(500).json({ success: false, message: "Bildirim güncellenemedi." });
  }
};

/**
 * GET /api/coach/students/:studentId/topics
 * Deneme sonucu girerken "yanlış yapılan konular"ı seçebilmek için —
 * öğrencinin track'ine (yks/lgs) uygun konu listesi, ustalık bilgisi yok
 * (koç için gerekli değil, sadece isim/id/ders/sınav türü).
 */
export const getTopicsForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { grade: true } });
    const track = effectiveTrackFromGrade(student?.grade);
    const topics = await prisma.topic.findMany({
      where: { track, hidden: false },
      orderBy: [{ examType: "asc" }, { subject: "asc" }, { order: "asc" }],
      select: { id: true, subject: true, name: true, examType: true },
    });

    res.json({ success: true, track, topics });
  } catch (error) {
    console.error("getTopicsForCoach:", error);
    res.status(500).json({ success: false, message: "Konular alınamadı." });
  }
};

/**
 * GET /api/coach/students/:studentId/mastery
 * Öğrencinin Konu Ağacı'nı (her konudaki ustalık seviyesiyle) koça
 * salt-okunur gösterir — ders planı hazırlarken zayıf konuları görsün.
 */
export const getMasteryForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { grade: true } });
    const track = effectiveTrackFromGrade(student?.grade);

    const [topics, masteries] = await Promise.all([
      prisma.topic.findMany({ where: { track, hidden: false }, orderBy: [{ examType: "asc" }, { subject: "asc" }, { order: "asc" }] }),
      prisma.topicMastery.findMany({ where: { studentId } }),
    ]);
    const stageByTopicId = new Map(masteries.map((m) => [m.topicId, m.stage]));
    const topicsWithStage = topics.map((t) => ({ ...t, stage: stageByTopicId.get(t.id) || "none" }));

    res.json({ success: true, track, topics: topicsWithStage });
  } catch (error) {
    console.error("getMasteryForCoach:", error);
    res.status(500).json({ success: false, message: "Konu ağacı alınamadı." });
  }
};

/**
 * GET /api/coach/students/:studentId/insights
 * "Akıllı Deneme Analizi" — son 3 denemede tekrar eden konu hataları.
 */
export const getInsightsForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const insights = await detectRecurringWeaknesses(studentId);
    res.json({ success: true, insights });
  } catch (error) {
    console.error("getInsightsForCoach:", error);
    res.status(500).json({ success: false, message: "İçgörüler alınamadı." });
  }
};

/**
 * POST /api/coach/students/:studentId/insights/:topicId/add-to-plan
 * Tekrar eden hata tespit edilen konuyu, koçun tek tıkla bu haftaki
 * programa (bugünün gününe) eklemesi — program yine koçun kontrolünde,
 * sistem sadece işaret ediyor, otomatik yazmıyor.
 */
export const addInsightTopicToPlan = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const topicId = parseInt(req.params.topicId);
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ success: false, message: "Konu bulunamadı." });

    const weekStart = toMondayStart(new Date());
    const dayOfWeek = todayDayOfWeek();

    let plan = await prisma.studyPlan.findFirst({ where: { studentId, weekStart } });
    if (!plan) {
      plan = await prisma.studyPlan.create({ data: { studentId, weekStart, createdById: req.user.id } });
    }
    const lastOrder = await prisma.studyPlanItem.count({ where: { studyPlanId: plan.id, dayOfWeek } });

    const item = await prisma.studyPlanItem.create({
      data: {
        studyPlanId: plan.id,
        dayOfWeek,
        subject: topic.subject,
        topic: `${topic.name} (tekrar eden hata — sistem önerisi)`,
        durationMin: 30,
        order: lastOrder,
      },
    });

    res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("addInsightTopicToPlan:", error);
    res.status(500).json({ success: false, message: "Programa eklenemedi." });
  }
};

/**
 * GET /api/coach/students/:studentId/day-reports
 * Öğrencinin son günlük özet raporları ("Z-Raporu") — hangi gün kaç görev
 * bitmiş/yarıda kalmış/zorlanılmış, hızlıca geriye dönük görmek için.
 */
export const getStudentDayReports = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const reports = await prisma.dayReport.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      take: 14,
    });

    res.json({ success: true, reports });
  } catch (error) {
    console.error("getStudentDayReports:", error);
    res.status(500).json({ success: false, message: "Raporlar alınamadı." });
  }
};

/**
 * GET /api/coach/students/:studentId/notes
 * Öğrenciye bırakılan son notlar (tarihçe) — koç ne yazdığını görsün.
 */
export const getNotesForCoach = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const notes = await prisma.coachNote.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 10 });
    res.json({ success: true, notes });
  } catch (error) {
    console.error("getNotesForCoach:", error);
    res.status(500).json({ success: false, message: "Notlar alınamadı." });
  }
};

/**
 * POST /api/coach/students/:studentId/notes/text
 * Body: { text }
 */
export const createTextNote = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Not metni boş olamaz." });

    const note = await prisma.coachNote.create({
      data: { studentId, coachId: req.user.id, type: "text", text: text.slice(0, 1000) },
    });
    res.status(201).json({ success: true, note });
  } catch (error) {
    console.error("createTextNote:", error);
    res.status(500).json({ success: false, message: "Not kaydedilemedi." });
  }
};

/**
 * POST /api/coach/students/:studentId/notes/audio
 * multipart/form-data, alan adı "audio" — uploadAudio middleware'i (route'ta) işliyor.
 */
export const createAudioNote = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const coach = await assertOwnStudent(req.user.id, studentId);
    if (!coach) return res.status(403).json({ success: false, message: "Bu öğrenci size atanmamış." });

    if (!req.file?.path) return res.status(400).json({ success: false, message: "Ses dosyası alınamadı." });

    const note = await prisma.coachNote.create({
      data: { studentId, coachId: req.user.id, type: "audio", audioUrl: req.file.path },
    });
    res.status(201).json({ success: true, note });
  } catch (error) {
    console.error("createAudioNote:", error);
    res.status(500).json({ success: false, message: "Ses notu kaydedilemedi." });
  }
};

