import prisma from "../utils/prisma.js";
import { toMondayStart } from "../utils/istanbulTime.js";

// Head coach'un görebileceği öğrenci kümesini tanımlayan ortak Prisma filtresi
// — K4 gereği İKİ YOL: (a) kendi Coach profiline doğrudan atanmış öğrenciler,
// (b) supervise ettiği bir coach'a atanmış öğrenciler. Her liste/aggregate
// sorgusu bu AYNI filtreyi kullanır ki "kendi öğrencilerim" grubu hiçbir
// yerde unutulmasın.
const myStudentsWhere = (headCoachUserId) => ({
  role: "student",
  assignedCoach: { OR: [{ userId: headCoachUserId }, { headCoachUserId }] },
});

/**
 * GET /api/head-coach/coaches
 * Supervise edilen coach'lar — her biri için öğrenci sayısı + son aktivite
 * proxy'si (en güncel CoachNote.createdAt, o coach'un öğrencilerine ait).
 * Not: head coach'un KENDİ doğrudan öğrencileri burada bir "coach kartı"
 * olarak görünmez (kendini supervise etmiyor) — onlar Genel Bakış'taki
 * toplam sayıya ve Öğrenciler listesindeki "Ben (doğrudan)" filtresine dahil.
 */
export const getMyCoaches = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const coaches = await prisma.coach.findMany({
      where: { headCoachUserId },
      select: { id: true, name: true, subject: true, image: true, userId: true },
      orderBy: { name: "asc" },
    });
    const coachIds = coaches.map((c) => c.id);
    if (coachIds.length === 0) return res.json({ success: true, coaches: [] });

    const students = await prisma.user.findMany({
      where: { assignedCoachId: { in: coachIds }, role: "student" },
      select: { id: true, assignedCoachId: true },
    });
    const studentIds = students.map((s) => s.id);
    const studentCountByCoach = new Map();
    for (const s of students) studentCountByCoach.set(s.assignedCoachId, (studentCountByCoach.get(s.assignedCoachId) || 0) + 1);
    const coachByStudentId = new Map(students.map((s) => [s.id, s.assignedCoachId]));

    // Son aktivite proxy'si — tek sorgu, N+1 yok.
    const lastNotes = studentIds.length
      ? await prisma.coachNote.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { createdAt: true } })
      : [];
    const lastActivityByCoach = new Map();
    for (const n of lastNotes) {
      const coachId = coachByStudentId.get(n.studentId);
      const at = n._max.createdAt;
      if (!at) continue;
      const cur = lastActivityByCoach.get(coachId);
      if (!cur || at > cur) lastActivityByCoach.set(coachId, at);
    }

    const result = coaches.map((c) => ({
      ...c,
      studentCount: studentCountByCoach.get(c.id) || 0,
      lastActivityAt: lastActivityByCoach.get(c.id) || null,
    }));
    res.json({ success: true, coaches: result });
  } catch (error) {
    console.error("getMyCoaches:", error);
    res.status(500).json({ success: false, message: "Koçlar alınamadı." });
  }
};

/**
 * GET /api/head-coach/coaches/:coachId
 * Tek koç + öğrenci roster'ı (plan/deneme/not var mı — sade sütunlar,
 * coach'un kendi dashboard'undaki ağır streak/weakness hesabı YOK, bu
 * ekranın amacı detaylı takip değil hızlı operasyonel özet).
 */
export const getCoachDetailForHeadCoach = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const coachId = parseInt(req.params.coachId);
    const coach = await prisma.coach.findFirst({ where: { id: coachId, headCoachUserId } });
    if (!coach) return res.status(403).json({ success: false, message: "Bu koç size bağlı değil." });

    const students = await prisma.user.findMany({
      where: { assignedCoachId: coachId, role: "student" },
      select: { id: true, name: true, email: true, grade: true, track: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    const studentIds = students.map((s) => s.id);
    const weekStart = toMondayStart(new Date());

    const [plansThisWeek, latestExams, lastNotes] = await Promise.all([
      studentIds.length ? prisma.studyPlan.findMany({ where: { studentId: { in: studentIds }, weekStart }, select: { studentId: true } }) : [],
      studentIds.length ? prisma.examResult.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { examDate: true } }) : [],
      studentIds.length ? prisma.coachNote.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { createdAt: true } }) : [],
    ]);
    const hasPlanSet = new Set(plansThisWeek.map((p) => p.studentId));
    const lastExamByStudent = new Map(latestExams.map((e) => [e.studentId, e._max.examDate]));
    const lastNoteByStudent = new Map(lastNotes.map((n) => [n.studentId, n._max.createdAt]));

    const roster = students.map((s) => ({
      ...s,
      hasPlanThisWeek: hasPlanSet.has(s.id),
      lastExamDate: lastExamByStudent.get(s.id) || null,
      lastNoteAt: lastNoteByStudent.get(s.id) || null,
    }));

    res.json({ success: true, coach, students: roster });
  } catch (error) {
    console.error("getCoachDetailForHeadCoach:", error);
    res.status(500).json({ success: false, message: "Koç detayı alınamadı." });
  }
};

/**
 * GET /api/head-coach/students?page=&pageSize=&q=&coachId=&examType=&hasPlanThisWeek=
 * Tüm ekibin (iki küme birleşik) öğrencileri — filtre/arama/pagination
 * (teacher.controller.js#listMyLessons ile aynı sayfalama deseni).
 */
export const getMyStudents = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, Math.min(50, parseInt(req.query.pageSize || "20", 10)));
    const skip = (page - 1) * pageSize;
    const q = String(req.query.q || "").trim();
    const { coachId, examType, id } = req.query;

    const where = {
      ...myStudentsWhere(headCoachUserId),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(coachId ? { assignedCoachId: parseInt(coachId) } : {}),
      ...(examType ? { track: examType } : {}),
      // Workspace route'u (/head-coach/students/:studentId) direkt URL'den
      // açıldığında, useStudentContext.js bu AYNI listeyi dar bir id
      // filtresiyle çekiyor — ayrı bir "tekil öğrenci" endpoint'i YOK.
      ...(id ? { id: parseInt(id) } : {}),
    };
    // coachId filtresi verildiyse, bu coach gerçekten bu head coach'a mı
    // bağlı (ya da head coach'un kendi Coach'u mu) — URL'den gelen coachId
    // başka bir ekibe ait olsa bile where zaten myStudentsWhere ile
    // kesiştiği için ekstra bir satır bulunamaz (IDOR doğal olarak kapalı).

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, grade: true, track: true, assignedCoachId: true, assignedCoach: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    const studentIds = items.map((s) => s.id);
    const weekStart = toMondayStart(new Date());
    const plansThisWeek = studentIds.length
      ? await prisma.studyPlan.findMany({ where: { studentId: { in: studentIds }, weekStart }, select: { studentId: true } })
      : [];
    const hasPlanSet = new Set(plansThisWeek.map((p) => p.studentId));

    const result = items.map((s) => ({ ...s, hasPlanThisWeek: hasPlanSet.has(s.id) }));
    res.json({ success: true, items: result, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
  } catch (error) {
    console.error("getMyStudents:", error);
    res.status(500).json({ success: false, message: "Öğrenciler alınamadı." });
  }
};

/**
 * GET /api/head-coach/overview
 * K14/K15 — deterministic KPI'lar + küçük "Dikkat Gerekebilir" bloğu, tek
 * aggregate sorgu seti (N+1 yok).
 */
export const getOverview = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const where = myStudentsWhere(headCoachUserId);

    const [coachCount, students] = await Promise.all([
      prisma.coach.count({ where: { headCoachUserId } }),
      prisma.user.findMany({ where, select: { id: true, name: true } }),
    ]);
    const studentIds = students.map((s) => s.id);
    const totalStudents = studentIds.length;
    const avgPerCoach = coachCount > 0 ? Math.round((totalStudents / coachCount) * 10) / 10 : 0;

    const weekStart = toMondayStart(new Date());
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [plansThisWeek, lastExams, lastNotes] = await Promise.all([
      studentIds.length ? prisma.studyPlan.findMany({ where: { studentId: { in: studentIds }, weekStart }, select: { studentId: true } }) : [],
      studentIds.length ? prisma.examResult.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { examDate: true } }) : [],
      studentIds.length ? prisma.coachNote.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { createdAt: true } }) : [],
    ]);
    const hasPlanSet = new Set(plansThisWeek.map((p) => p.studentId));
    const lastExamByStudent = new Map(lastExams.map((e) => [e.studentId, e._max.examDate]));
    const lastNoteByStudent = new Map(lastNotes.map((n) => [n.studentId, n._max.createdAt]));

    const studentsWithPlanThisWeek = studentIds.filter((id) => hasPlanSet.has(id)).length;
    const studentsWithoutPlanThisWeek = totalStudents - studentsWithPlanThisWeek;

    // K15 — Dikkat Gerekebilir: 3 sabit, deterministic kural (AI skoru YOK).
    const noPlan = students.filter((s) => !hasPlanSet.has(s.id)).map((s) => ({ id: s.id, name: s.name, reason: "Bu hafta planı yok" }));
    const noRecentExam = students
      .filter((s) => { const d = lastExamByStudent.get(s.id); return !d || new Date(d) < sevenDaysAgo; })
      .map((s) => ({ id: s.id, name: s.name, reason: "7+ gündür deneme sonucu yok" }));
    const noRecentNote = students
      .filter((s) => { const d = lastNoteByStudent.get(s.id); return !d || new Date(d) < sevenDaysAgo; })
      .map((s) => ({ id: s.id, name: s.name, reason: "7+ gündür koç notu yok" }));

    res.json({
      success: true,
      totalCoaches: coachCount,
      totalStudents,
      studentsWithPlanThisWeek,
      studentsWithoutPlanThisWeek,
      avgStudentsPerCoach: avgPerCoach,
      attentionNeeded: { noPlan, noRecentExam, noRecentNote },
    });
  } catch (error) {
    console.error("getOverview:", error);
    res.status(500).json({ success: false, message: "Özet alınamadı." });
  }
};

/**
 * GET /api/head-coach/sos-alerts
 * Ekip-geneli, çözülmemiş SOS bildirimleri (READ-only — resolveSosAlert V1'de
 * head coach'a açılmıyor, bkz. plan K6/K9).
 */
export const getSosAlertsForHeadCoach = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const alerts = await prisma.sosAlert.findMany({
      where: { resolvedAt: null, student: myStudentsWhere(headCoachUserId) },
      include: { student: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, alerts });
  } catch (error) {
    console.error("getSosAlertsForHeadCoach:", error);
    res.status(500).json({ success: false, message: "SOS bildirimleri alınamadı." });
  }
};

/**
 * PATCH /api/head-coach/students/:studentId/coach
 * Body: { coachId }
 * K7 — öğrenci SADECE head coach'un kendi ekibi İÇİNDE transfer edilebilir:
 * hem mevcut koç hem hedef koç headCoachUserId===req.user.id olmalı. Admin'in
 * sınırsız assignCoachToUser'ı burada KULLANILMIYOR — bilerek ayrı, dar
 * kapsamlı bir fonksiyon.
 * BİLİNEN BOŞLUK: bu transferi kimin yaptığı/ne zaman yapıldığı hiçbir
 * yerde tutulmuyor (adminCoach.controller.js#assignCoachToUser ile AYNI
 * sınırlama — V1'de yeni bir audit sistemi kurulmuyor).
 */
export const transferStudentWithinTeam = async (req, res) => {
  try {
    const headCoachUserId = req.user.id;
    const studentId = parseInt(req.params.studentId);
    const targetCoachId = parseInt(req.body?.coachId);
    if (!Number.isFinite(targetCoachId)) return res.status(400).json({ success: false, message: "Hedef koç zorunlu." });

    const student = await prisma.user.findFirst({ where: { id: studentId, role: "student" }, select: { id: true, assignedCoach: { select: { id: true, userId: true, headCoachUserId: true } } } });
    if (!student) return res.status(404).json({ success: false, message: "Öğrenci bulunamadı." });
    const currentCoach = student.assignedCoach;
    const currentlyMine = currentCoach && (currentCoach.userId === headCoachUserId || currentCoach.headCoachUserId === headCoachUserId);
    if (!currentlyMine) return res.status(403).json({ success: false, message: "Bu öğrenci ekibinize bağlı değil." });

    const targetCoach = await prisma.coach.findFirst({ where: { id: targetCoachId, OR: [{ userId: headCoachUserId }, { headCoachUserId }] } });
    if (!targetCoach) return res.status(403).json({ success: false, message: "Hedef koç ekibinize bağlı değil." });

    const updated = await prisma.user.update({
      where: { id: studentId },
      data: { assignedCoachId: targetCoachId },
      select: { id: true, name: true, email: true, assignedCoachId: true },
    });
    res.json({ success: true, student: updated });
  } catch (error) {
    console.error("transferStudentWithinTeam:", error);
    res.status(500).json({ success: false, message: "Transfer yapılamadı." });
  }
};
