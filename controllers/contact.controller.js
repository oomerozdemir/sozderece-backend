import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import { emailShell, infoCard, noteCard } from "../utils/sendEmail.js";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const hashData = (data) => {
  if (!data) return null;
  return crypto.createHash("sha256").update(data).digest("hex");
};

// Mail template'inde HTML Injection'a karşı tüm kullanıcı verilerini escape eder
const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const VALID_USER_TYPES = ["Mezun", "12. Sınıf", "11. Sınıf", "8. Sınıf", "7. Sınıf", "Veli"];

// Frontend ile senkron - sadece bu saatler kabul edilir
const VALID_TIME_SLOTS = new Set([
  "09:00 - 09:20", "09:20 - 09:40", "09:40 - 10:00",
  "10:00 - 10:20", "10:20 - 10:40", "10:40 - 11:00",
  "11:00 - 11:20", "11:20 - 11:40", "11:40 - 12:00",
  "12:00 - 12:20", "12:20 - 12:40", "12:40 - 13:00",
  "13:00 - 13:20", "13:20 - 13:40", "13:40 - 14:00",
  "14:00 - 14:20", "14:20 - 14:40", "14:40 - 15:00",
  "15:00 - 15:20", "15:20 - 15:40", "15:40 - 16:00",
  "16:00 - 16:20", "16:20 - 16:40", "16:40 - 17:00",
  "17:00 - 17:20", "17:20 - 17:40", "17:40 - 18:00",
  "18:00 - 18:20", "18:20 - 18:40", "18:40 - 19:00",
  "19:00 - 19:20", "19:20 - 19:40", "19:40 - 20:00",
  "20:00 - 20:20", "20:20 - 20:40", "20:40 - 21:00",
]);

export const createContact = async (req, res) => {
  try {
    const { name, phone, email, userType, meetingDate, meetingTime, message } = req.body;

    // --- Zorunlu alan kontrolü ---
    if (!name || !phone || !email || !userType || !meetingDate || !meetingTime) {
      return res.status(400).json({ success: false, message: "Tüm zorunlu alanlar doldurulmalıdır." });
    }

    // --- name: 2-100 karakter, sadece harf/boşluk ---
    const trimmedName = String(name).trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({ success: false, message: "Ad Soyad 2-100 karakter arasında olmalıdır." });
    }
    if (!/^[a-zA-ZçÇğĞıİöÖşŞüÜ\s'-]+$/.test(trimmedName)) {
      return res.status(400).json({ success: false, message: "Ad Soyad sadece harf içerebilir." });
    }

    // --- email: format + max 254 karakter ---
    const trimmedEmail = String(email).toLowerCase().trim();
    if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta adresi." });
    }

    // --- phone: Türkiye formatı (05XX XXX XX XX veya +90 ile başlayan) ---
    const cleanPhone = String(phone).replace(/\D/g, "");
    if (!/^(0?5\d{9}|905\d{9})$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: "Geçersiz telefon numarası. (05XX XXX XX XX formatında giriniz)" });
    }

    // --- userType: whitelist ---
    if (!VALID_USER_TYPES.includes(userType)) {
      return res.status(400).json({ success: false, message: "Geçersiz kullanıcı tipi." });
    }

    // --- meetingDate: YYYY-MM-DD format, bugün veya sonrası, max 2 ay ---
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meetingDate))) {
      return res.status(400).json({ success: false, message: "Geçersiz tarih formatı." });
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const maxDateObj = new Date();
    maxDateObj.setMonth(maxDateObj.getMonth() + 2);
    maxDateObj.setHours(23, 59, 59, 999);
    const dateObj = new Date(meetingDate);
    if (isNaN(dateObj.getTime()) || dateObj < todayStart || dateObj > maxDateObj) {
      return res.status(400).json({ success: false, message: "Randevu tarihi bugün ile 2 ay arasında olmalıdır." });
    }

    // --- meetingTime: whitelist ---
    if (!VALID_TIME_SLOTS.has(String(meetingTime))) {
      return res.status(400).json({ success: false, message: "Geçersiz randevu saati." });
    }

    // --- message: max 1000 karakter ---
    const trimmedMessage = message ? String(message).trim().slice(0, 1000) : "";

    // --- Slotu ATOMİK olarak dene (önce claim, sonra kaydet — check-then-act
    // yerine tek adımlı DB işlemleri kullanılıyor, iki eşzamanlı istek aynı
    // slotu alamaz) ---
    let slotClaimed = false;
    const claimResult = await prisma.consultationSlot.updateMany({
      where: { date: meetingDate, timeSlot: meetingTime, isBlocked: false },
      data: { isBlocked: true },
    });
    if (claimResult.count > 0) {
      slotClaimed = true;
    } else {
      try {
        await prisma.consultationSlot.create({
          data: { date: meetingDate, timeSlot: meetingTime, isBlocked: true },
        });
        slotClaimed = true;
      } catch (e) {
        // P2002: unique constraint çakışması — slot az önce başka bir istekle alındı
        if (e.code !== "P2002") throw e;
      }
    }
    if (!slotClaimed) {
      return res.status(409).json({ success: false, message: "Bu randevu saati dolmuştur. Lütfen başka bir saat seçin." });
    }

    // --- Veritabanına Kaydet ---
    await prisma.contact.create({
      data: {
        name: trimmedName,
        phone: cleanPhone,
        email: trimmedEmail,
        userType,
        meetingDate,
        meetingTime,
        message: trimmedMessage,
      },
    });

    // --- Mail Gönder (tüm veriler HTML escape edilmiş) ---
    const safe = {
      name: escapeHtml(trimmedName),
      userType: escapeHtml(userType),
      phone: escapeHtml(cleanPhone),
      email: escapeHtml(trimmedEmail),
      meetingDate: escapeHtml(meetingDate),
      meetingTime: escapeHtml(meetingTime),
      message: escapeHtml(trimmedMessage),
    };

    const mailOptions = {
      from: `"Sözderece Web" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `📅 Yeni Randevu Talebi: ${safe.name}`,
      html: emailShell({
        eyebrow: "Ücretsiz Görüşme Formu",
        title: "Yeni bir görüşme talebiniz var!",
        subtitle: "Web sitesi üzerinden yeni bir form dolduruldu.",
        bodyHtml: `
          ${infoCard([
            ["Ad Soyad", safe.name],
            ["Durumu", safe.userType],
            ["Telefon", `<a href="tel:${safe.phone}" style="color:#1e1b3a;">${safe.phone}</a>`],
            ["E-posta", safe.email],
          ])}
          ${infoCard(
            [
              ["Randevu Tarihi", safe.meetingDate],
              ["Randevu Saati", safe.meetingTime],
            ],
            { bg: "#fef6e7", border: "#f6e2b3" }
          )}
          ${safe.message ? noteCard(`<strong>Mesaj:</strong><br/>${safe.message}`) : ""}
        `,
      }),
    };

    transporter.sendMail(mailOptions).catch((err) => console.error("Mail gönderme hatası:", err));

    // --- Facebook Conversion API ---
    if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_PIXEL_ID) {
      const clientIp = req.ip || req.socket?.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";

      const fbEventData = {
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: req.headers.referer || "https://sozderecekocluk.com/ucretsiz-on-gorusme",
            user_data: {
              em: [hashData(trimmedEmail)],
              ph: [hashData(cleanPhone)],
              fn: [hashData(trimmedName.split(" ")[0].toLowerCase())],
              client_ip_address: clientIp,
              client_user_agent: userAgent,
            },
            custom_data: {
              currency: "TRY",
              value: 250.0,
              content_name: "Ucretsiz On Gorusme Formu",
            },
          },
        ],
      };

      axios
        .post(
          `https://graph.facebook.com/v17.0/${process.env.FACEBOOK_PIXEL_ID}/events?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
          fbEventData
        )
        .catch((error) => {
          console.error("❌ Facebook CAPI Hatası:", error.response ? error.response.data : error.message);
        });
    }

    res.status(201).json({ success: true, message: "Başvuru alındı" });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};
