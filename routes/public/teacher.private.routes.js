import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js"; 
import {
  registerTeacher,
  loginTeacher,
  getMyTeacherProfile,
  updateMyTeacherProfile,
  resendTeacherEmailCode,
  verifyTeacherEmailCode,
} from "../../controllers/teacher.controller.js";

const router = express.Router();

/* Auth (public) */
router.post("/auth/kayit", registerTeacher);
router.post("/auth/giris", loginTeacher);

/* Panel (sadece teacher) */
router.get("/me/profil", authenticateToken, authorizeRoles("teacher"), getMyTeacherProfile);
router.put("/me/profil", authenticateToken, authorizeRoles("teacher"), updateMyTeacherProfile);

/* Teacher Regiset Mail Dogrulama Kodu*/
router.post("/auth/email/resend", authenticateToken, authorizeRoles("teacher"), resendTeacherEmailCode);
router.post("/auth/email/verify", authenticateToken, authorizeRoles("teacher"), verifyTeacherEmailCode);

export default router;
