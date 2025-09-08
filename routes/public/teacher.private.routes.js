// src/routes/public/teacher.private.routes.js
import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js"; 
import {
  registerTeacher,
  loginTeacher,
  getMyTeacherProfile,
  updateMyTeacherProfile,
  resendTeacherEmailCode,
  verifyTeacherEmailCode,
  uploadTeacherPhoto,
  getMyAvailability, getMySlots, upsertMyAvailability,
  listMyAppointments, listMyTimeOff,
  createMyTimeOff, createMyAppointment, deleteMyTimeOff, updateMyAppointment,
  changeMyPassword,
  listMyLessons, createMyLesson, updateMyLesson, deleteMyLesson,
  updateAppointmentStatus, getMyIncomingRequests, getMyConfirmedAppointments,
  completeAppointmentByTeacher, getMyPastAppointmentsTeacher,
} from "../../controllers/teacher.controller.js";
import upload from "../../middleware/upload.js";

const router = express.Router();

/* Auth (public) */
router.post("/auth/kayit", registerTeacher);
router.post("/auth/giris", loginTeacher);

/* Panel (sadece teacher) */
router.get("/me/profil", authenticateToken, authorizeRoles("teacher"), getMyTeacherProfile);
router.put("/me/profil", authenticateToken, authorizeRoles("teacher"), updateMyTeacherProfile);

/* Teacher Register Mail Doğrulama Kodu */
router.post("/auth/email/resend", authenticateToken, authorizeRoles("teacher"), resendTeacherEmailCode);
router.post("/auth/email/verify", authenticateToken, authorizeRoles("teacher"), verifyTeacherEmailCode);

/* Teacher Bio Photo */
router.post("/me/photo", authenticateToken, authorizeRoles("teacher"), upload.single("photo"), uploadTeacherPhoto);

/* Uygunluk (weekly template) */
router.get("/me/availability", authenticateToken, authorizeRoles("teacher"), getMyAvailability);
router.put("/me/availability", authenticateToken, authorizeRoles("teacher"), upsertMyAvailability);

/* Time-off */
router.get("/me/timeoff", authenticateToken, authorizeRoles("teacher"), listMyTimeOff);
router.post("/me/timeoff", authenticateToken, authorizeRoles("teacher"), createMyTimeOff);
router.delete("/me/timeoff/:id", authenticateToken, authorizeRoles("teacher"), deleteMyTimeOff);

/* Slot önizleme (öğretmen kendine) */
router.get("/me/slots", authenticateToken, authorizeRoles("teacher"), getMySlots);

/* Randevular */
router.get("/me/appointments", authenticateToken, authorizeRoles("teacher"), listMyAppointments);
router.post("/me/appointments", authenticateToken, authorizeRoles("teacher"), createMyAppointment);
router.put("/me/appointments/:id", authenticateToken, authorizeRoles("teacher"), updateMyAppointment);

/* Şifre değiştir */
router.put("/me/password", authenticateToken, authorizeRoles("teacher"), changeMyPassword);

/* Derslerim */
router.get("/me/lessons", authenticateToken, authorizeRoles("teacher"), listMyLessons);
router.post("/me/lessons", authenticateToken, authorizeRoles("teacher"), createMyLesson);
router.put("/me/lessons/:id", authenticateToken, authorizeRoles("teacher"), updateMyLesson);
router.delete("/me/lessons/:id", authenticateToken, authorizeRoles("teacher"), deleteMyLesson);

/* Ders Talepleri */
router.get("/me/requests", authenticateToken, authorizeRoles("teacher"), getMyIncomingRequests);
router.patch("/appointments/:id/status", authenticateToken, authorizeRoles("teacher"), updateAppointmentStatus);

/* Onaylanmış randevular (öğrenci bilgisi dahil) */
router.get("/me/appointments/confirmed", authenticateToken, authorizeRoles("teacher"), getMyConfirmedAppointments);

/* Dersin bittiğini işaretle & geçmiş dersler */
router.patch("/appointments/:id/complete", authenticateToken, authorizeRoles("teacher"), completeAppointmentByTeacher);
router.get("/me/appointments/past", authenticateToken, authorizeRoles("teacher"), getMyPastAppointmentsTeacher);

export default router;
