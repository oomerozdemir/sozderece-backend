import prisma from "../utils/prisma.js";
import { toMondayStart, todayDayOfWeek } from "./studentPanel.controller.js";


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

    // "Anlık görür": bugün "Zorlandım"/"Yarıda Kaldı" işaretleyen öğrencileri
    // tek ek sorguyla bulup listeye rozet olarak ekliyoruz — koç, kartı
    // açmadan kimin dikkat istediğini görsün.
    const studentIds = students.map((s) => s.id);
    const weekStart = toMondayStart(new Date());
    const dayOfWeek = todayDayOfWeek();
    const flaggedToday = studentIds.length
      ? await prisma.studyPlanItem.findMany({
          where: {
            status: { in: ["stuck", "partial"] },
            dayOfWeek,
            studyPlan: { studentId: { in: studentIds }, weekStart },
          },
          select: { status: true, studyPlan: { select: { studentId: true } } },
        })
      : [];
    const stuckSet = new Set(flaggedToday.filter((i) => i.status === "stuck").map((i) => i.studyPlan.studentId));
    const partialSet = new Set(flaggedToday.filter((i) => i.status === "partial").map((i) => i.studyPlan.studentId));

    const withFlags = students.map((s) => ({
      ...s,
      strugglingToday: stuckSet.has(s.id),
      partialToday: partialSet.has(s.id),
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

    res.json({ success: true, items });
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

