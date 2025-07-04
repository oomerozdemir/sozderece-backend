import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { getStudentProfile } from "../../controllers/studentController.js";

const router = express.Router();

router.get("/me", authenticateToken, getStudentProfile); // 👈 Controller fonksiyonu çağrılıyor

export default router;
