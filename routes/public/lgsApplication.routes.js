import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getLgsSettings,
  updateLgsSettings,
  getLgsContent,
  updateLgsContent,
  submitLgsApplication,
  listLgsApplications,
  exportLgsCsv,
} from "../../controllers/lgsApplication.controller.js";

const router = express.Router();

// Public
router.get("/settings/lgs", getLgsSettings);
router.get("/lgs-content", getLgsContent);
router.post("/lgs-application", submitLgsApplication);

// Admin
router.get("/admin/lgs-applications", authenticateToken, authorizeRoles("admin"), listLgsApplications);
router.get("/admin/lgs-applications/export", authenticateToken, authorizeRoles("admin"), exportLgsCsv);
router.put("/admin/settings/lgs", authenticateToken, authorizeRoles("admin"), updateLgsSettings);
router.put("/admin/lgs-content", authenticateToken, authorizeRoles("admin"), updateLgsContent);

export default router;
