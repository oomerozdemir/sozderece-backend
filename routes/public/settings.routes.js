import express from "express";
import { getCountdown, getPopup } from "../../controllers/siteSettings.controller.js";

const router = express.Router();

// Herkese açık - geri sayım ayarlarını getir
router.get("/countdown", getCountdown);

// Herkese açık - popup ayarlarını getir
router.get("/popup", getPopup);

export default router;
