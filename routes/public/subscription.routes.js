import express from "express";
import {
  startSubscription,
  getMySubscriptions,
  cancelSubscription,
} from "../../controllers/subscription.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Abonelik başlatmak, misafir/OTP-öncesi değil — her zaman gerçek giriş şart
// (bkz. plan: "Abonelik başlatmadan önce gerçek giriş (e-posta OTP) şart").
router.post("/subscriptions/start", authenticateToken, startSubscription);
router.get("/subscriptions/me", authenticateToken, authorizeRoles("student"), getMySubscriptions);
router.put("/subscriptions/:id/cancel", authenticateToken, authorizeRoles("student"), cancelSubscription);

// NOT: PayTR'nin kart-kaydı callback'i için AYRI bir route yok — PayTR'nin
// tek, sabit bildirim URL'si (merchant panelinde kayıtlı) her zaman
// order.controller.js#handlePaytrCallback'e düşer. Abonelik başlatma sonucu
// da oradan, PaymentMeta'daki işarete bakılarak finalizeSubscriptionStart
// çağrılarak işlenir (bkz. subscription.controller.js).

export default router;
