import express from "express";
import { validateCoupon, markCouponUsed, createCoupon, getAllCoupons, deleteCoupon } from "../../controllers/coupon.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
const router = express.Router();

router.post("/validate", validateCoupon);
router.post("/mark-used", markCouponUsed);
router.get("/all", authenticateToken, getAllCoupons);
router.delete("/:id", authenticateToken, deleteCoupon);
router.post("/create", authenticateToken, authorizeRoles("admin"),createCoupon);

export default router;
