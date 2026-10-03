// routes/public/student.routes.js
import express from "express";
import multer from "multer";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getStudentProfile,
  completeAppointmentByStudent,
  getMyPastAppointmentsStudent,
  createAppointmentReviewByStudent,
  getFreeRights,
  markPanelTourCompleted,
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
import {
  getAiQuestionUsage,
  createAiQuestion,
  getAiQuestionHistory,
  getAiQuestionDetail,
  createFollowup,
  getMyQuestionInsights,
  updateUnderstandingStatus,
  generateVerification,
  answerVerification,
} from "../../controllers/aiQuestion.controller.js";

const router = express.Router();

// Soru fotoğrafı: bellekte tutulup Cloudinary'ye+Claude'a gönderilir, disk'e
// yazılmaz (parseStudyPlanImage'daki memUploadImage deseninin aynısı).
const memUploadQuestionImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — tek soru fotoğrafı için yeterli
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Sadece görsel dosyaları yüklenebilir."));
  },
});

// multer, dosya boyutu/tipi reddini senkron route handler'a değil Express'in
// hata zincirine düşürür — bu olmadan oversized/invalid dosya denemeleri ham
// bir stack-trace HTML sayfası olarak 500 dönüyordu (hiçbir yerde proje
// genelinde multer hatası için bir error-handler yok). "AI hataları teknik
// hata mesajı olarak gösterilmesin" kuralı dosya reddi için de geçerli.
const handleUploadError = (err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, message: "Dosya 5MB'tan büyük olamaz." });
  }
  return res.status(422).json({ success: false, message: "Dosya yüklenemedi, lütfen farklı bir görsel deneyin." });
};

// Günlük kota zaten sert sınır — bu yalnızca art arda hızlı deneme/döngü
// tacizine karşı ek bir katman.
const aiQuestionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? String(req.user.id) : ipKeyGenerator(req.ip)),
  message: { success: false, message: "Çok fazla istek gönderildi, lütfen biraz bekleyin." },
});

/* Profil */
router.get("/me", authenticateToken, getStudentProfile);
router.patch("/me/tour-completed", authenticateToken, markPanelTourCompleted);

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

/* AI Soru Asistanı — /history ve /usage, dinamik /:id'den ÖNCE tanımlı
   (Deneme Merkezi'nde de uygulanan Express sıralama kuralı). */
router.get("/me/ai-question/usage", authenticateToken, authorizeRoles("student"), getAiQuestionUsage);
router.post(
  "/me/ai-question",
  authenticateToken,
  authorizeRoles("student"),
  aiQuestionLimiter,
  memUploadQuestionImage.single("image"),
  handleUploadError,
  createAiQuestion
);
router.get("/me/ai-question/history", authenticateToken, authorizeRoles("student"), getAiQuestionHistory);
router.get("/me/ai-question/insights", authenticateToken, authorizeRoles("student"), getMyQuestionInsights);
router.get("/me/ai-question/:id", authenticateToken, authorizeRoles("student"), getAiQuestionDetail);
router.post("/me/ai-question/:id/followup", authenticateToken, authorizeRoles("student"), createFollowup);
router.patch("/me/ai-question/:id/understanding", authenticateToken, authorizeRoles("student"), updateUnderstandingStatus);
router.post("/me/ai-question/:id/verification/generate", authenticateToken, authorizeRoles("student"), aiQuestionLimiter, generateVerification);
router.post("/me/ai-question/:id/verification/:verificationId/answer", authenticateToken, authorizeRoles("student"), aiQuestionLimiter, answerVerification);



export default router;
