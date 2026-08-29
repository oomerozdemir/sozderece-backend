import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyOtpAndLogin,
  verifyContact,
  silentLogin,
  logout,
} from "../../controllers/auth.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// 15 dakikada IP başına max 10 giriş denemesi (brute-force koruması)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin." },
});

// 1 saatte IP başına max 10 kayıt (kayıt spam koruması)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla kayıt denemesi. Lütfen 1 saat sonra tekrar deneyin." },
});

// 10 dakikada IP başına max 5 OTP isteği (mail bombing koruması)
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla doğrulama kodu isteği. Lütfen 10 dakika sonra tekrar deneyin." },
});

// 10 dakikada IP başına max 8 OTP doğrulama denemesi (brute-force koruması —
// bu endpoint başarılı olunca gerçek giriş yaptırıyor, kod 6 haneli ve
// öncesinde limitsizdi)
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla doğrulama denemesi. Lütfen 10 dakika sonra tekrar deneyin." },
});

// 1 saatte IP başına max 5 şifre sıfırlama isteği (mail bombing koruması)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Çok fazla şifre sıfırlama isteği. Lütfen 1 saat sonra tekrar deneyin." },
});

/* Public */
router.post("/register", registerLimiter, registerUser);
router.post("/login", loginLimiter, loginUser);
router.post("/otp/send", otpSendLimiter, sendOtp);
router.post("/otp/verify", otpVerifyLimiter, verifyOtpAndLogin);

/* Remember cookie akışı */
router.get("/silent-login", silentLogin);
router.post("/logout", logout);

/* Protected */
router.get("/me", authenticateToken, getMe);
router.put("/update-profile", authenticateToken, updateProfile);
router.post("/verify-contact", authenticateToken, verifyContact);

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", forgotPasswordLimiter, resetPassword);

export default router;
