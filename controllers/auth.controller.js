import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createVerificationCode, verifyCode } from "../services/verificationService.js";

const prisma = new PrismaClient();


export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, grade, track } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Bu e-posta zaten kayıtlı." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: role || "student",
        phone,
        grade,
        track
      },
    });

  await createVerificationCode({
    userId: newUser.id,
    type: "email",
    target: normalizedEmail,
  });

    res.status(201).json({
      success: true,
      message: "Kayıt başarılı",
      user: { id: newUser.id, email: newUser.email, role: newUser.role }
    });
  } catch (error) {
    console.error("Register error:");
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};


export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Şifre yanlış." });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" } // 🔒 Süre .env'den alınır
    );

    res.status(200).json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified || false // ✅ Frontend için gönderilir
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};



export const getMe = async (req, res) => {
  try {
    const { id: userId } = req.user; 

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        isVerified: true,
        emailVerified: true,
        grade: true,
        track: true,
        phoneVerified: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("getMe error:");
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};


export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phone, grade, track } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && {email,emailVerified: false }),
        ...(phone && { phone }),
        ...(grade && { grade }),
        ...(track !== undefined && { track: track || null }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        grade: true,
        track: true,
        role: true,
        isVerified: true
      }
    });

    res.status(200).json({ user: updatedUser });
  } catch (error) {
    console.error("Profil güncelleme hatası:");
    res.status(500).json({ message: "Profil güncellenemedi" });
  }
};



export const changePassword = async (req, res) => {
  try {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Mevcut şifre hatalı." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed }
    });

    res.status(200).json({ success: true, message: "Şifre başarıyla değiştirildi." });
  } catch (error) {
    console.error("Şifre değişim hatası:");
    res.status(500).json({ success: false, message: "Şifre değiştirilemedi." });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ message: "E-posta gerekli" });
    }

    // ✳️ Buraya EKLE:
    if (!input.includes("@")) {
      return res.status(400).json({ message: "Lütfen geçerli bir e-posta adresi girin." });
    }

    const user = await prisma.user.findFirst({
      where: {
        email: input, // çünkü artık sadece e-posta üzerinden doğrulama yapıyoruz
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    const code = await createVerificationCode({
      userId: user.id,
      type: "email",
      target: user.email,
    });

    return res.status(200).json({ message: "Doğrulama kodu e-posta ile gönderildi." });

  } catch (error) {
    console.error("❌ forgotPassword error:", error);
    return res.status(500).json({ message: "Bir hata oluştu. Lütfen tekrar deneyin." });
  }
};


export const resetPassword = async (req, res) => {
  try {
    const { code, newPassword } = req.body;

    if (!code || !newPassword) {
      return res.status(400).json({ message: "Kod ve yeni şifre gereklidir." });
    }

    // Kodla eşleşen kullanıcıyı bul
    const record = await prisma.verificationCode.findFirst({
      where: {
        code,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!record) {
      return res.status(400).json({ message: "Kod geçersiz veya süresi dolmuş." });
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    // Kodu doğrula ve sil
    await verifyCode({
      userId: user.id,
      type: record.type,
      target: record.target,
      code
    });

    // Şifreyi güncelle
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        emailVerified: record.type === "email" ? true : undefined,
        phoneVerified: record.type === "phone" ? true : undefined
      }
    });

    return res.status(200).json({ message: "Şifre başarıyla güncellendi." });

  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ message: "Kod geçersiz veya sunucu hatası." });
  }
};

export const verifyContact = async (req, res) => {
  try {
    const { userId } = req.user;
    const { type } = req.body; 

    if (!["email", "phone"].includes(type)) {
      return res.status(400).json({ message: "Geçersiz doğrulama türü." });
    }

    const updateField = type === "email" ? { emailVerified: true } : { phoneVerified: true };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateField,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        phoneVerified: true
      }
    });

    res.status(200).json({ user: updatedUser });
  } catch (error) {
    console.error("Doğrulama güncelleme hatası:");
    res.status(500).json({ message: "Doğrulama kaydedilemedi." });
  }
};


export const updatePassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword) {
    return res.status(400).json({ message: "Yeni şifre gerekli." });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ message: "Şifre başarıyla güncellendi." });
  } catch (error) {
    console.error("Şifre güncelleme hatası:");
    res.status(500).json({ message: "Şifre güncellenemedi." });
  }
};
