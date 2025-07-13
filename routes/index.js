import express from "express";

// 🔓 Public routes
import authRoutes from "./public/auth.routes.js";
import contactRoutes from "./public/contact.routes.js";
import orderRoutes from "./public/order.routes.js";
import userRoutes from "./public/user.routes.js";
import packageRoutes from "./public/package.routes.js";
import protectedRoutes from "./public/protected.routes.js";
import studentRoutes from "./public/student.routes.js";
import coachRoutes from "./public/coach.routes.js";
import couponRoutes from "./public/coupon.routes.js";
// 🔐 Admin routes
import adminRoutes from "./admin/adminRoutes.js";

const router = express.Router();

// Public API endpoints
router.use("/auth", authRoutes);
router.use("/contact", contactRoutes);
router.use("/", orderRoutes);
router.use("/users", userRoutes);
router.use("/packages", packageRoutes);
router.use("/", protectedRoutes); 
router.use("/student", studentRoutes);
router.use("/coach", coachRoutes);
router.use("/coaches", coachRoutes);
router.use("/coupon", couponRoutes);




// Admin API endpoints
router.use("/admin", adminRoutes);

export default router;
