import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  // changePassword, 
  // updatePassword, 
  // forgotPassword, 
  // resetPassword,  
  sendOtp,
  verifyOtpAndLogin,
  verifyContact,
  silentLogin,            
  logout,               
} from "../../controllers/auth.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

/* Public */
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/otp/send", sendOtp);
router.post("/otp/verify", verifyOtpAndLogin);

/* Remember cookie akışı */
router.get("/silent-login", silentLogin);  // ✅ FE axios.withCredentials ile çağıracak
router.post("/logout", logout);            // ✅ çıkışta cookie + DB revoke

/* Protected */
router.get("/me", authenticateToken, getMe);
router.put("/update-profile", authenticateToken, updateProfile);
router.post("/verify-contact", authenticateToken, verifyContact);

router.patch("/change-password", authenticateToken, changePassword);
router.put("/change-password", authenticateToken, updatePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
