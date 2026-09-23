import express from "express";
import rateLimit from "express-rate-limit";
import { checkPriceLock } from "../../controllers/priceLock.controller.js";

const router = express.Router();

// Kayıtlı e-posta/telefon taramasını (enumeration) yavaşlatmak için sıkı limit.
const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla deneme yapıldı. Lütfen biraz bekleyin." },
});

router.post("/check", checkLimiter, checkPriceLock);

export default router;
