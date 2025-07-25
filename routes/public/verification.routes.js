import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { createVerificationCode, verifyCode } from "../../services/verificationService.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();



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
    console.error("Kod gönderme hatası:");
    res.status(500).json({ success: false, message: "Kod gönderilemedi." });
  }
});

// Kod doğrula
router.post("/verify-code", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { type, target, code } = req.body;

  try {
    const success = await verifyCode({ userId, type, target, code });

    if (!success) {
      return res.status(400).json({ message: "Kod doğrulanamadı." });
    }

    // email doğrulandıysa kullanıcıyı güncelle
    if (type === "email") {
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      });
    }

    return res.status(200).json({ message: "Doğrulama başarılı." });
  } catch (err) {
    console.error("🚨 Doğrulama hatası:");
    return res.status(400).json({ message: "Kod doğrulanamadı." });
  }
});


export default router;
