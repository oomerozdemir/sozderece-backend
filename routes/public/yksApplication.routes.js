import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getYksSettings,
  updateYksSettings,
  getYksContent,
  updateYksContent,
  submitYksApplication,
  listYksApplications,
  exportYksCsv,
  updateYksApplicationStatus,
  deleteYksApplication,
} from "../../controllers/yksApplication.controller.js";

const router = express.Router();

// 1 saatte IP başına max 5 YKS başvurusu (spam koruması)
const yksApplicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla başvuru gönderildi. Lütfen 1 saat sonra tekrar deneyin." },
});

// Public
router.get("/settings/yks", getYksSettings);
router.get("/yks-content", getYksContent);
router.post("/yks-application", yksApplicationLimiter, submitYksApplication);

// Admin
router.get("/admin/yks-applications", authenticateToken, authorizeRoles("admin"), listYksApplications);
router.get("/admin/yks-applications/export", authenticateToken, authorizeRoles("admin"), exportYksCsv);
router.put("/admin/yks-applications/:id/status", authenticateToken, authorizeRoles("admin"), updateYksApplicationStatus);
router.delete("/admin/yks-applications/:id", authenticateToken, authorizeRoles("admin"), deleteYksApplication);
router.put("/admin/settings/yks", authenticateToken, authorizeRoles("admin"), updateYksSettings);
router.put("/admin/yks-content", authenticateToken, authorizeRoles("admin"), updateYksContent);

export default router;
