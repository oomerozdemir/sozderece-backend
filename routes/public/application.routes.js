import express from "express";
import rateLimit from "express-rate-limit";
import upload from "../../middleware/upload.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  createInstructorApplication,
  getAllApplications,
  updateApplicationStatus,
} from "../../controllers/application.controller.js";

const router = express.Router();

// 1 saatte IP başına max 5 başvuru (spam koruması)
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla başvuru gönderildi. Lütfen 1 saat sonra tekrar deneyin." },
});

/**
 * POST /api/v1/applications/apply
 * Public route - anyone can apply
 * Accepts CV file upload (PDF/DOCX)
 */
router.post("/apply", applicationLimiter, upload.single("cv"), createInstructorApplication);

/**
 * GET /api/v1/applications
 * Admin only - list all applications
 */
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  getAllApplications
);

/**
 * PATCH /api/v1/applications/:id/status
 * Admin only - update application status
 */
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateApplicationStatus
);

export default router;
