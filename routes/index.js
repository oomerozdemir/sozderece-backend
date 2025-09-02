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
import verificationRoutes from "./public/verification.routes.js";
import cartRoutes from "./public/cart.routes.js";
import ogretmenPrivateRoutes from "./public/teacher.private.routes.js";
import ogretmenlerPublicRoutes from "./public/teacher.public.routes.js";
import studentRequestRouter from "./public/studentRequest.routes.js";


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
router.use("/verification", verificationRoutes);
router.use("/", cartRoutes);
router.use("/v1/ogretmen", ogretmenPrivateRoutes);
router.use("/v1/ogretmenler", ogretmenlerPublicRoutes);
router.use("/v1/student-requests", studentRequestRouter);



// Admin API endpoints
router.use("/admin", adminRoutes);

export default router;
