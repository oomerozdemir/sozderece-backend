import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import {
  getAssignedStudents, getAllPublicCoaches,
  getStudentStudyPlanForCoach, upsertStudentStudyPlan, parseStudyPlanImage,
  getStudentExamResultsForCoach, addStudentExamResult,
  getStudentTodayForCoach, getStudentDayReports,
  getSosAlertsForCoach, resolveSosAlert,
  getInsightsForCoach, addInsightTopicToPlan, getTopicsForCoach, getMasteryForCoach,
  getNotesForCoach, createTextNote, createAudioNote,
} from "../../controllers/coach.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { uploadAudio } from "../../middleware/upload.js";

const prisma = new PrismaClient();
const router = express.Router();

// Haftalık program görseli/PDF'i: Claude'a base64 olarak gönderilecek,
// Cloudinary'ye kalıcı yüklenmesine gerek yok — bellekte tutup işlenip atılır.
// Bu fileFilter yalnızca ilk, iyimser bir kontrol (client-beyanlı mimetype'a
// bakıyor) — asıl güvenlik kontrolü controller'daki buffer imza doğrulaması
// (utils/fileSignature.js#detectFileType).
const memUploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Sadece görsel ya da PDF dosyaları yüklenebilir."));
  },
});

// Public: Öğrenciler için koçları getir
router.get("/my-students", authenticateToken, authorizeRoles("coach"), getAssignedStudents);
router.get("/public-coach", getAllPublicCoaches);

/* Öğrenci Paneli (Faz 1) — koç tarafı veri girişi */
router.get("/students/:studentId/study-plan", authenticateToken, authorizeRoles("coach"), getStudentStudyPlanForCoach);
router.post("/students/:studentId/study-plan", authenticateToken, authorizeRoles("coach"), upsertStudentStudyPlan);
router.post("/students/:studentId/study-plan/parse-image", authenticateToken, authorizeRoles("coach"), memUploadImage.single("image"), parseStudyPlanImage);
router.get("/students/:studentId/exam-results", authenticateToken, authorizeRoles("coach"), getStudentExamResultsForCoach);
router.post("/students/:studentId/exam-results", authenticateToken, authorizeRoles("coach"), addStudentExamResult);
router.get("/students/:studentId/today", authenticateToken, authorizeRoles("coach"), getStudentTodayForCoach);
router.get("/students/:studentId/day-reports", authenticateToken, authorizeRoles("coach"), getStudentDayReports);
router.get("/sos-alerts", authenticateToken, authorizeRoles("coach"), getSosAlertsForCoach);
router.patch("/sos-alerts/:id/resolve", authenticateToken, authorizeRoles("coach"), resolveSosAlert);
router.get("/students/:studentId/topics", authenticateToken, authorizeRoles("coach"), getTopicsForCoach);
router.get("/students/:studentId/mastery", authenticateToken, authorizeRoles("coach"), getMasteryForCoach);
router.get("/students/:studentId/insights", authenticateToken, authorizeRoles("coach"), getInsightsForCoach);
router.post("/students/:studentId/insights/:topicId/add-to-plan", authenticateToken, authorizeRoles("coach"), addInsightTopicToPlan);
router.get("/students/:studentId/notes", authenticateToken, authorizeRoles("coach"), getNotesForCoach);
router.post("/students/:studentId/notes/text", authenticateToken, authorizeRoles("coach"), createTextNote);
router.post("/students/:studentId/notes/audio", authenticateToken, authorizeRoles("coach"), uploadAudio.single("audio"), createAudioNote);


export default router;
