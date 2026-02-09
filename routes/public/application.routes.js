import express from "express";
import upload from "../../middleware/upload.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  createInstructorApplication,
  getAllApplications,
  updateApplicationStatus,
} from "../../controllers/application.controller.js";

const router = express.Router();

/**
 * POST /api/v1/applications/apply
 * Public route - anyone can apply
 * Accepts CV file upload (PDF/DOCX)
 */
router.post("/apply", upload.single("cv"), createInstructorApplication);

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