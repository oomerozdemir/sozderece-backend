import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getLgsSettings,
  updateLgsSettings,
  getLgsContent,
  updateLgsContent,
  submitLgsApplication,
  listLgsApplications,
  exportLgsCsv,
  updateLgsApplicationStatus,
  deleteLgsApplication,
} from "../../controllers/lgsApplication.controller.js";

const router = express.Router();

// 1 saatte IP başına max 5 LGS başvurusu (spam koruması)
const lgsApplicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla başvuru gönderildi. Lütfen 1 saat sonra tekrar deneyin." },
});

// Public
router.get("/settings/lgs", getLgsSettings);
router.get("/lgs-content", getLgsContent);
router.post("/lgs-application", lgsApplicationLimiter, submitLgsApplication);

// Admin
router.get("/admin/lgs-applications", authenticateToken, authorizeRoles("admin"), listLgsApplications);
router.get("/admin/lgs-applications/export", authenticateToken, authorizeRoles("admin"), exportLgsCsv);
router.put("/admin/lgs-applications/:id/status", authenticateToken, authorizeRoles("admin"), updateLgsApplicationStatus);
router.delete("/admin/lgs-applications/:id", authenticateToken, authorizeRoles("admin"), deleteLgsApplication);
router.put("/admin/settings/lgs", authenticateToken, authorizeRoles("admin"), updateLgsSettings);
router.put("/admin/lgs-content", authenticateToken, authorizeRoles("admin"), updateLgsContent);

export default router;
