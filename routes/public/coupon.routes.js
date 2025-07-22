import express from "express";
import { validateCoupon, markCouponUsed, createCoupon, getAllCoupons, deleteCoupon } from "../../controllers/coupon.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
const router = express.Router();

router.post("/validate", authenticateToken, validateCoupon);
router.post("/mark-used",authorizeRoles("admin"), markCouponUsed);
router.get("/all", authenticateToken,authorizeRoles("admin"), getAllCoupons);
router.delete("/:id", authenticateToken,authorizeRoles("admin"), deleteCoupon);
router.post("/create", authenticateToken, authorizeRoles("admin"),createCoupon);

export default router;
