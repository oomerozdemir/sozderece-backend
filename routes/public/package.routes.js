import express from "express";
import { getAllPackages, createPackage } from "../../controllers/package.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Herkes erişebilir
router.get("/", getAllPackages);

// Sadece admin paket ekleyebilir
router.post("/", authenticateToken, authorizeRoles("admin"), createPackage);

export default router;
