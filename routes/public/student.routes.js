// routes/public/student.routes.js
import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  getStudentProfile,
  completeAppointmentByStudent,
  getMyPastAppointmentsStudent,
  createAppointmentReviewByStudent,
  getFreeRights,
} from "../../controllers/studentController.js";
import {
  getMyStudyPlan,
  setStudyPlanItemStatus,
  getMyToday,
  getMyExamResults,
  getMyActiveExam,
  startLiveExam,
  finishLiveExam,
  submitExamResults,
  submitExamSelfAnalysis,
  createManualExamResult,
  getMyExamResultDetail,
  getMyResources,
  getMyAnnouncements,
  getMySummary,
  startPomodoro,
  stopPomodoro,
  createSosAlert,
  getMyTopics,
  setTopicMastery,
  getMyInsights,
  getMyLatestNote,
} from "../../controllers/studentPanel.controller.js";

const router = express.Router();

/* Profil */
router.get("/me", authenticateToken, getStudentProfile);

router.patch(
  "/appointments/:id/complete",
  authenticateToken,
  completeAppointmentByStudent
);

router.get(
  "/me/appointments/past",
  authenticateToken,
  getMyPastAppointmentsStudent
);


// Değerlendirme: Öğrenci -> Randevuya yorum/puan
router.post(
  "/appointments/:id/review",
  authenticateToken,
  createAppointmentReviewByStudent
);

// Ücretsiz ders hakları
router.get("/free-rights", authenticateToken, getFreeRights);

/* Öğrenci Paneli (Faz 1) */
router.get("/me/today", authenticateToken, getMyToday);
router.get("/me/study-plan", authenticateToken, getMyStudyPlan);
router.patch("/me/study-plan/items/:id/status", authenticateToken, setStudyPlanItemStatus);
router.get("/me/exam-results", authenticateToken, getMyExamResults);
// Deneme Merkezi — Not: /active ve /manual, dinamik /:id rotasından ÖNCE
// tanımlanmalı, aksi halde Express bu kelimeleri :id olarak yakalar.
router.get("/me/exam-results/active", authenticateToken, getMyActiveExam);
router.post("/me/exam-results/live/start", authenticateToken, startLiveExam);
router.post("/me/exam-results/manual", authenticateToken, createManualExamResult);
router.patch("/me/exam-results/:id/finish", authenticateToken, finishLiveExam);
router.patch("/me/exam-results/:id/results", authenticateToken, submitExamResults);
router.patch("/me/exam-results/:id/analysis", authenticateToken, submitExamSelfAnalysis);
router.get("/me/exam-results/:id", authenticateToken, getMyExamResultDetail);
router.get("/me/resources", authenticateToken, getMyResources);
router.get("/me/announcements", authenticateToken, getMyAnnouncements);
router.get("/me/summary", authenticateToken, getMySummary);
router.post("/me/pomodoro/start", authenticateToken, startPomodoro);
router.patch("/me/pomodoro/:id/stop", authenticateToken, stopPomodoro);
router.post("/me/sos", authenticateToken, createSosAlert);
router.get("/me/topics", authenticateToken, getMyTopics);
router.patch("/me/topics/:topicId/mastery", authenticateToken, setTopicMastery);
router.get("/me/insights", authenticateToken, getMyInsights);
router.get("/me/notes/latest", authenticateToken, getMyLatestNote);



export default router;
