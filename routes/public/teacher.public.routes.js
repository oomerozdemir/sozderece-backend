import express from "express";
import {
  searchTeachers,
  getTeacherBySlug,
  trackTeacherView,
  addTeacherReview,
  listTeacherReviews,
  getTeacherSlotsPublic,
} from "../../controllers/teacher.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
const router = express.Router();

// Liste
router.get("/", searchTeachers);
router.post("/:slug/view", trackTeacherView);
router.get("/:slug/reviews", listTeacherReviews);
router.post("/:slug/reviews", authenticateToken, addTeacherReview);

// ÖNCE /:slug/slots
router.get("/:slug/slots", getTeacherSlotsPublic);

// EN SONA profil
router.get("/:slug", getTeacherBySlug);



export default router;
