import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getLgsSettings,
  updateLgsSettings,
  submitLgsApplication,
  listLgsApplications,
  exportLgsCsv,
} from "../../controllers/lgsApplication.controller.js";

const router = express.Router();

// Public
router.get("/settings/lgs", getLgsSettings);
router.post("/lgs-application", submitLgsApplication);

// Admin
router.get("/admin/lgs-applications", authenticateToken, authorizeRoles("admin"), listLgsApplications);
router.get("/admin/lgs-applications/export", authenticateToken, authorizeRoles("admin"), exportLgsCsv);
router.put("/admin/settings/lgs", authenticateToken, authorizeRoles("admin"), updateLgsSettings);

export default router;
