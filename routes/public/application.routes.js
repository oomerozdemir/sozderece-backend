import express from "express";
import rateLimit from "express-rate-limit";
import uploadDocs from "../../middleware/uploadDocs.js";
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
 * CV (tek dosya) + örnek program dosyaları (en fazla 5) — PDF/Word/resim
 */
router.post(
  "/apply",
  applicationLimiter,
  uploadDocs.fields([
    { name: "cv", maxCount: 1 },
    { name: "samplePrograms", maxCount: 5 },
  ]),
  createInstructorApplication
);

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
