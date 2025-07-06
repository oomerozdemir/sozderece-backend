import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();


export const createContact = async (req, res) => {
  try {
    const { name, phone, email, message } = req.body;

    const newContact = await prisma.contact.create({
      data: { name, phone, email, message }
    });

    res.status(201).json({ success: true, data: newContact });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const createTrialMeeting = async (req, res) => {
  try {
    const { name, email, phone, userType, date, message } = req.body;

    if (!name || !email || !phone || !userType || !date || !message) {
      return res.status(400).json({
        success: false,
        message: "Tüm alanlar zorunludur.",
      });
    }

    await prisma.trialMeeting.create({
      data: { name, email, phone, userType, date, message }
    });

    // Mail gönder (nodemailer ile)
    await transporter.sendMail({
  from: '"Sözderece Koçluk" <iletisim@sozderecekocluk.com>',
  to: "iletisim@sozderecekocluk.com", 
  subject: "Yeni Ücretsiz Ön Görüşme Talebi",
  html: `
    <p><strong>Ad:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Telefon:</strong> ${phone}</p>
    <p><strong>Kullanıcı Tipi:</strong> ${userType}</p>
    <p><strong>Randevu Tarihi:</strong> ${date}</p>
    <p><strong>Mesaj:</strong> ${message}</p>
  `,
});

    res.status(201).json({ success: true, message: "Talep alındı" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};