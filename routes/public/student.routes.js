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
  toggleStudyPlanItem,
  getMyExamResults,
  getMyResources,
  getMyAnnouncements,
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
router.get("/me/study-plan", authenticateToken, getMyStudyPlan);
router.patch("/me/study-plan/items/:id/complete", authenticateToken, toggleStudyPlanItem);
router.get("/me/exam-results", authenticateToken, getMyExamResults);
router.get("/me/resources", authenticateToken, getMyResources);
router.get("/me/announcements", authenticateToken, getMyAnnouncements);



export default router;
