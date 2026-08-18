import express from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth } from "../../middleware/authMiddleware.js";
import { startSession, pingSession } from "../../controllers/tracking.controller.js";

const router = express.Router();

// Anonim/oturum-açmamış ziyaretçilerden gelir, IP başına cömert ama sınırlı.
const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla istek." },
});

const pingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla istek." },
});

router.post("/tracking/session/start", startLimiter, optionalAuth, startSession);
router.post("/tracking/session/ping", pingLimiter, optionalAuth, pingSession);

export default router;
