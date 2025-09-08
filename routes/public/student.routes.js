import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { getStudentProfile, completeAppointmentByStudent, getMyPastAppointmentsStudent, 
 } from "../../controllers/studentController.js";

const router = express.Router();

router.get("/me", authenticateToken, getStudentProfile);
router.patch("/student/v1/ogrenci/appointments/:id/complete", authenticateToken, completeAppointmentByStudent);
router.get("/student/v1/ogrenci/me/appointments/past", authenticateToken, getMyPastAppointmentsStudent);


export default router;
