import express from "express";
import { getCountdown } from "../../controllers/siteSettings.controller.js";

const router = express.Router();

// Herkese açık - geri sayım ayarlarını getir
router.get("/countdown", getCountdown);

export default router;
