import express from "express";
import rateLimit from "express-rate-limit";
import { joinWaitlist } from "../../controllers/waitlist.controller.js";

const router = express.Router();

// 1 saat içinde IP başına max 5 kayıt — spam formundan korumak için.
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene." },
});

router.post("/", waitlistLimiter, joinWaitlist);

export default router;
