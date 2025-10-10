import prisma from "../utils/prisma.js";

import bcrypt from "bcrypt";
import crypto from "crypto";
import { createVerificationCode, verifyCode } from "../services/verificationService.js";
import { generateToken } from "../middleware/authMiddleware.js"; // access token (kısa)
import { REMEMBER_COOKIE_NAME, rememberCookieOptions } from "../cron/cookies.js";
import { sendEmail } from "../utils/sendEmail.js";
import { sendVerificationEmail } from "../utils/sendEmail.js";


/* ---------------- Helpers ---------------- */

function makeDisplayName() {
  const n = Math.floor(1000 + Math.random() * 9000); // 1000–9999
  return `Kullanıcı${n}`;
}

function makeRememberSecret() {
  // yüksek entropi secret
  return crypto.randomBytes(32).toString("hex");
}

async function setRememberCookieForUser(userId, req, res) {
  const secret = makeRememberSecret();
  const secretHash = await bcrypt.hash(secret, 10);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 gün

  const rec = await prisma.rememberToken.create({
    data: {
      userId,
      secretHash,
      userAgent: req.get("user-agent") || null,
      ip: req.ip || null,
      expiresAt,
    },
    select: { id: true },
  });

  // cookie değeri: "<id>.<secret>"
  res.cookie(REMEMBER_COOKIE_NAME, `${rec.id}.${secret}`, rememberCookieOptions);
}

async function clearRememberCookie(req, res) {
  try {
    const raw = req.cookies?.[REMEMBER_COOKIE_NAME];
    if (raw && typeof raw === "string" && raw.includes(".")) {
      const [id, secret] = raw.split(".");
      const rec = await prisma.rememberToken.findUnique({ where: { id } });
      if (rec && !rec.revoked && rec.expiresAt > new Date()) {
        const ok = await bcrypt.compare(secret, rec.secretHash);
        if (ok) {
          await prisma.rememberToken.update({
            where: { id: rec.id },
            data: { revoked: true },
          });
        }
      }
    }
  } catch {}
  res.clearCookie(REMEMBER_COOKIE_NAME, rememberCookieOptions);
}

/* --------------- REGISTER --------------- */
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
        track,
      },
    });

    res.status(201).json({
      success: true,
      message: "Kayıt başarılı",
      user: { id: newUser.id, email: newUser.email, role: newUser.role },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};

/* --------------- PASSWORD LOGIN (opsiyonel) --------------- */
export const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı." });
    }

    const isMatch = await bcrypt.compare(password, user.password || "");
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Şifre yanlış." });
    }

    // kısa access token
    const token = generateToken(
      { id: user.id, email: user.email, role: user.role || "student" },
      false
    );

    // "Beni Hatırla" → remember cookie + DB kaydı
    if (rememberMe) {
      await setRememberCookieForUser(user.id, req, res);
    }

    res.status(200).json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified || false,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};

/* --------------- ME --------------- */
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
        phoneVerified: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("getMe error:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

/* --------------- UPDATE PROFILE --------------- */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phone, grade, track } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email, emailVerified: false }),
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
        isVerified: true,
      },
    });

    res.status(200).json({ user: updatedUser });
  } catch (error) {
    console.error("Profil güncelleme hatası:", error);
    res.status(500).json({ message: "Profil güncellenemedi" });
  }
};




/* --------------- CONTACT VERIFY FLAGGING --------------- */
export const verifyContact = async (req, res) => {
  try {
    const userId = req.user.id; // <-- düzeltildi
    const { type } = req.body;

    if (!["email", "phone"].includes(type)) {
      return res.status(400).json({ message: "Geçersiz doğrulama türü." });
    }

    const updateField = type === "email" ? { emailVerified: true } : { phoneVerified: true };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateField,
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        emailVerified: true, phoneVerified: true
      },
    });

    res.status(200).json({ user: updatedUser });
  } catch (error) {
    console.error("Doğrulama güncelleme hatası:", error);
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
    console.error("Şifre güncelleme hatası:", error);
    res.status(500).json({ message: "Şifre güncellenemedi." });
  }
};

/* --------------- OTP SEND --------------- */
export const sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Geçerli bir e-posta gerekli." });
    }

    // idempotent: aynı email için ikinci kayıt oluşmaz
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        role: "student",
        emailVerified: false,
        name: makeDisplayName(),
      },
      select: { id: true, email: true },
    });

 const rec = await createVerificationCode({ userId: user.id, type: "email", target: email });
    // e-postayı arkada gönder (yanıtı bekletme)
    sendVerificationEmail(rec.target, rec.code).catch((e) => {
      console.error("sendVerificationEmail failed:", e);
    });
    // hızlı yanıt
    return res.status(200).json({ success: true, message: "Doğrulama kodu gönderiliyor." });
  } catch (err) {
    console.error("sendOtp error:", err);
     if (err?.code === "RATE_LIMIT") {
      // FE butonunu countdown’la kilitleyebilmeniz için kalan saniyeyi döndürüyoruz
      return res.status(429).json({
        success: false,
        message: err.message,
        retryAfter: err.retryAfter ?? 60
      });
    }
    return res.status(500).json({ success: false, message: "Kod gönderilemedi." });
  }
};

/* --------------- OTP VERIFY + LOGIN (REMEMBER COOKIE DÂHİL) --------------- */
export const verifyOtpAndLogin = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const code = (req.body?.code || "").trim();
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "E-posta ve kod zorunludur." });
    }

    // idempotent kullanıcı
    let user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        role: "student",
        emailVerified: false,
        name: makeDisplayName(),
      },
    });

    // OTP doğrulama
    await verifyCode({ userId: user.id, type: "email", target: email, code });

    // Email doğrulandı; ad boşsa doldur
    const needsName = !user.name || user.name.trim().length === 0;
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        isVerified: true,
        ...(needsName ? { name: makeDisplayName() } : {}),
      },
    });

    // kısa access token
    const token = generateToken(
      { id: user.id, email: user.email, role: user.role || "student" },
      false
    );

    // remember cookie (beni hatırla)
    if (rememberMe) {
      await setRememberCookieForUser(user.id, req, res);
    }

    // Güncel kullanıcıyı döndür
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        phone: true,
        grade: true,
        track: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Giriş başarılı.",
      token,
      user: fresh,
    });
  } catch (err) {
    console.error("verifyOtpAndLogin error:", err);
    return res.status(400).json({ success: false, message: "Kod geçersiz veya süresi dolmuş." });
  }
};

/* --------------- SILENT LOGIN (COOKIE → ACCESS TOKEN) --------------- */
export const silentLogin = async (req, res) => {
  const soft = req.query.soft === "1" || req.query.soft === "true";
  try {
    const raw = req.cookies?.[REMEMBER_COOKIE_NAME];
    if (!raw || typeof raw !== "string" || !raw.includes(".")) {
      return soft
        ? res.status(200).json({ authenticated: false })
        : res.status(401).json({ success: false, message: "Remember yok." });
    }

    const [id, secret] = raw.split(".");
    if (!id || !secret) {
      return soft
        ? res.status(200).json({ authenticated: false })
        : res.status(401).json({ success: false, message: "Geçersiz remember." });
    }

    const rec = await prisma.rememberToken.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!rec || rec.revoked || rec.expiresAt <= new Date()) {
      return soft
        ? res.status(200).json({ authenticated: false })
        : res.status(401).json({ success: false, message: "Remember geçersiz." });
    }

    const ok = await bcrypt.compare(secret, rec.secretHash);
    if (!ok || !rec.user) {
      return soft
        ? res.status(200).json({ authenticated: false })
        : res.status(401).json({ success: false, message: "Remember hatalı." });
    }

    const user = rec.user;
    const accessToken = generateToken(
      { id: user.id, email: user.email, role: user.role || "student" },
      false
    );

    const payload = {
      success: true,
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        phone: user.phone,
        grade: user.grade,
        track: user.track,
      },
    };

    // soft modda da aynı içeriği döndürüyoruz ama ayrıca authenticated:true bayrağı ekli
    return soft
      ? res.status(200).json({ authenticated: true, ...payload })
      : res.status(200).json(payload);
  } catch {
    return soft
      ? res.status(200).json({ authenticated: false })
      : res.status(401).json({ success: false });
  }
};


/* --------------- LOGOUT (COOKIE SİL + DB REVOKE) --------------- */
// LOGOUT (remember revoke + cookie clear)
export const logout = async (req, res) => {
  try {
    // Varsayılan: bu cihazı unut (cookie + DB revoke)
    // İstersen FE {forgetDevice:false} gönderebilirsin.
    const forgetDevice = req.body?.forgetDevice !== false;

    if (forgetDevice) {
      await clearRememberCookie(req, res); // DB'de revoke + cookie'yi siler
    }

    return res.sendStatus(204);
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(200).json({ success: true }); // idempotent kalsın
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const email =
      (req.body?.email || req.body?.input || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res
        .status(200)
        .json({ success: true, message: "Eğer kayıtlıysanız e-posta gönderildi." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Kullanıcı yoksa da enumeration engellemek için aynı yanıt:
    if (!user) {
      return res
        .status(200)
        .json({ success: true, message: "Eğer kayıtlıysanız e-posta gönderildi." });
    }

    // Önceki token’ı temizle (idempotent)
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 dk

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://sozderece.com";
    const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

    await sendEmail({
      to: email,
      subject: "Şifre Sıfırlama",
      html: `
        <p>Merhaba,</p>
        <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
        <p><a href="${resetLink}" target="_blank">${resetLink}</a></p>
        <p>Bu bağlantı <b>30 dakika</b> içinde geçerlidir.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message:
        "Şifre sıfırlama bağlantısı e-postanıza gönderildi. Lütfen spam klasörünü de kontrol edin.",
    });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res
      .status(200)
      .json({ success: true, message: "Eğer kayıtlıysanız e-posta gönderildi." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Eksik alan." });
    }
    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Şifreler uyuşmuyor." });
    }

    const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!rec || rec.expiresAt <= new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Token geçersiz veya süresi dolmuş." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: rec.userId },
      data: { password: hashed },
    });

    // Token’ı tek kullanımlık yap
    await prisma.passwordResetToken.delete({ where: { token } });

    return res
      .status(200)
      .json({ success: true, message: "Şifreniz güncellendi." });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Şifre sıfırlama başarısız." });
  }
};
