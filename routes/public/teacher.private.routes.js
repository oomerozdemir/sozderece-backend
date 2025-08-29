import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js"; 
import {
  registerTeacher,
  loginTeacher,
  getMyTeacherProfile,
  updateMyTeacherProfile,
} from "../../controllers/teacher.controller.js";

const router = express.Router();

/* Auth (public) */
router.post("/auth/kayit", registerTeacher);
router.post("/auth/giris", loginTeacher);

/* Panel (sadece teacher) */
router.get("/me/profil", authenticateToken, authorizeRoles("teacher"), getMyTeacherProfile);
router.put("/me/profil", authenticateToken, authorizeRoles("teacher"), updateMyTeacherProfile);

export default router;
