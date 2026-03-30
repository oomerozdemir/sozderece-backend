import express from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import {
  getCampContent,
  updateCampContent,
  submitApplication,
  listApplications,
  exportApplicationsCSV,
} from "../../controllers/campPage.controller.js";

const router = express.Router();

router.get("/camp-page", getCampContent);
router.post("/camp-page/apply", submitApplication);
router.put("/admin/camp-page", authenticateToken, authorizeRoles("admin"), updateCampContent);
router.get("/admin/camp-applications", authenticateToken, authorizeRoles("admin"), listApplications);
router.get("/admin/camp-applications/export", authenticateToken, authorizeRoles("admin"), exportApplicationsCSV);

export default router;
