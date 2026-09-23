import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { getMyOnboarding, saveMyOnboarding, completeMyOnboardingForm, claimOnboarding } from "../../controllers/onboarding.controller.js";

const router = express.Router();

// Ödeme sonrası yoklama (polling) için yeterince geniş, tarama için dar.
const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla deneme yapıldı. Lütfen biraz bekleyin." },
});

router.post("/claim", claimLimiter, claimOnboarding);
router.get("/me", authenticateToken, authorizeRoles("student"), getMyOnboarding);
router.put("/me", authenticateToken, authorizeRoles("student"), saveMyOnboarding);
router.post("/me/complete", authenticateToken, authorizeRoles("student"), completeMyOnboardingForm);

export default router;
