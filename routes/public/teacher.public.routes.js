import express from "express";
import {
  searchTeachers,
  getTeacherBySlug,
  trackTeacherView,
  addTeacherReview,
  listTeacherReviews,
} from "../../controllers/teacher.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
const router = express.Router();

// Liste
router.get("/", searchTeachers);

// NEW: view sayacı (dinamik slug'dan ÖNCE gelmeli!)
router.post("/:slug/view", trackTeacherView);

// NEW: değerlendirmeler
router.get("/:slug/reviews", listTeacherReviews);
router.post("/:slug/reviews", authenticateToken, addTeacherReview);

// Profil — DİNAMİK en sonda
router.get("/:slug", getTeacherBySlug);


export default router;
