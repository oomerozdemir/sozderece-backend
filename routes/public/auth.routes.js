import express from "express";
import { forgotPassword, resetPassword } from "../../controllers/auth.controller.js";
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  updatePassword,
  sendOtp,
  verifyOtpAndLogin
} from "../../controllers/auth.controller.js";

import { authenticateToken } from "../../middleware/authMiddleware.js";
import { verifyContact } from "../../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.post("/verify-contact", authenticateToken, verifyContact);

router.post("/otp/send",sendOtp);
router.post("/otp/verify", verifyOtpAndLogin);
router.get("/me", authenticateToken, getMe);
router.put("/update-profile", authenticateToken, updateProfile);

/*
router.patch("/change-password", authenticateToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.put("/change-password", authenticateToken, updatePassword);
*/
export default router;
