import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { createVerificationCode, verifyCode } from "../services/verificationService.js";

const router = express.Router();


router.post("/send-code", authenticateToken, async (req, res) => {
  const { type, target } = req.body;

  if (type !== "email") {
    return res.status(400).json({ success: false, message: "Sadece email doğrulama destekleniyor." });
  }

  try {
    await createVerificationCode({
      userId: req.user.id,
      type,
      target,
    });

    res.json({ success: true, message: "Kod gönderildi." });
  } catch (error) {
    console.error("Kod gönderme hatası:", error.message);
    res.status(500).json({ success: false, message: "Kod gönderilemedi." });
  }
});

// Kod doğrula
router.post("/verify-code", authenticateToken, async (req, res) => {
  const { type, target, code } = req.body;

  try {
    await verifyCode({
      userId: req.user.id,
      type,
      target,
      code,
    });

    // E-posta doğrulandıysa kullanıcıyı güncelle
    if (type === "email") {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { emailVerified: true },
      });
    }

    res.json({ success: true, message: "Doğrulama başarılı." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
