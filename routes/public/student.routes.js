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



export default router;
