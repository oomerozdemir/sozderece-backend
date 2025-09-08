// routes/public/student.routes.js
import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  getStudentProfile,
  completeAppointmentByStudent,
  getMyPastAppointmentsStudent,
} from "../../controllers/studentController.js";

const router = express.Router();

/* Profil */
router.get("/me", authenticateToken, getStudentProfile);

router.patch(
  "/v1/ogrenci/appointments/:id/complete",
  authenticateToken,
  completeAppointmentByStudent
);

router.get(
  "/v1/ogrenci/me/appointments/past",
  authenticateToken,
  getMyPastAppointmentsStudent
);

export default router;
