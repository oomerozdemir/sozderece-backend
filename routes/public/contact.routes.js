import express from "express";
import rateLimit from "express-rate-limit";
import { createContact } from "../../controllers/contact.controller.js";
import { getConsultationSlots } from "../../controllers/consultationSlot.controller.js";

const router = express.Router();

// POST /api/contact: 1 saat içinde IP başına max 5 form gönderimi
const contactSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla talep gönderildi. Lütfen 1 saat sonra tekrar deneyin." },
});

// GET /api/contact/slots: 1 dakikada IP başına max 30 sorgu
const slotsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { blockedSlots: [], error: "Çok fazla tarih sorgulandı. Lütfen biraz bekleyin." },
});

router.post("/", contactSubmitLimiter, createContact);
router.get("/slots", slotsLimiter, getConsultationSlots);

export default router;
