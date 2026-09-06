import express from "express";
import { validateCoupon, markCouponUsed, createCoupon, updateCoupon, getAllCoupons, deleteCoupon } from "../../controllers/coupon.controller.js";
import { authenticateToken, authorizeRoles, optionalAuth } from "../../middleware/authMiddleware.js";
const router = express.Router();

// optionalAuth (authenticateToken DEĞİL): checkout misafir-öncelikli, giriş
// yapmamış bir müşteri kupon uygulayamıyordu (bkz. commit mesajı).
router.post("/validate", optionalAuth, validateCoupon);
// authenticateToken eksikti: req.user undefined olduğunda authorizeRoles crash veriyordu
router.post("/mark-used", authenticateToken, authorizeRoles("admin"), markCouponUsed);
router.get("/all", authenticateToken,authorizeRoles("admin"), getAllCoupons);
router.delete("/:id", authenticateToken,authorizeRoles("admin"), deleteCoupon);
router.post("/create", authenticateToken, authorizeRoles("admin"),createCoupon);
router.put("/:id", authenticateToken, authorizeRoles("admin"), updateCoupon);

export default router;
