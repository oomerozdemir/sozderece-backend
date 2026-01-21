import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

// Mail Gönderme Ayarları (Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // .env dosyanızdaki mail
    pass: process.env.EMAIL_PASS, // .env dosyanızdaki "Uygulama Şifresi"
  },
});

const hashData = (data) => {
  if (!data) return null;
  return crypto.createHash("sha256").update(data).digest("hex");
};

export const createContact = async (req, res) => {
  try {
    // 1. Frontend'den gelen verileri al
    const { name, phone, email, userType, meetingDate, meetingTime, message } = req.body;

    // 2. Veritabanına Kaydet
    const newContact = await prisma.contact.create({
      data: {
        name,
        phone,
        email,
        userType: userType || "Belirtilmemiş",
        meetingDate: meetingDate || null,
        meetingTime: meetingTime || null,
        message: message || ""
      }
    });

    // 3. Yöneticiye (Sana) Mail Gönder
    const mailOptions = {
      from: `"Sözderece Web" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Mail sana gelecek
      subject: `📅 Yeni Randevu Talebi: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #100481;">Yeni Bir Görüşme Talebiniz Var!</h2>
          <p>Web sitesi üzerinden yeni bir form dolduruldu.</p>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Ad Soyad:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Durumu:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${userType}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Telefon:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="tel:${phone}">${phone}</a></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>E-posta:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Randevu Tarihi:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; background-color: #fff3cd;"><strong>${meetingDate || "Seçilmedi"}</strong></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Randevu Saati:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; background-color: #fff3cd;"><strong>${meetingTime || "Seçilmedi"}</strong></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Mesaj:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${message}</td></tr>
          </table>
          
          <p style="margin-top: 20px; font-size: 12px; color: #888;">Bu mail otomatik olarak gönderilmiştir.</p>
        </div>
      `,
    };

    // Maili asenkron gönder (Hata olursa kullanıcıya yansıtma, logla)
    transporter.sendMail(mailOptions).catch(err => console.error("Mail gönderme hatası:", err));


     // 4. FACEBOOK CONVERSION API (Server-Side Tracking) - BU KISIM EKSİKTİ
    if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_PIXEL_ID) {
        
        // Telefon numarasını temizle (sadece rakam kalsın) ve şifrele
        const cleanPhone = phone.replace(/\D/g, ''); 
        
        const fbEventData = {
            data: [
                {
                    event_name: "Lead",
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: "website",
                    event_source_url: req.headers.referer || "https://sozderecekocluk.com/ucretsiz-on-gorusme",
                    user_data: {
                        ph: [hashData(cleanPhone)], // Şifrelenmiş telefon
                        client_ip_address: clientIp,
                        client_user_agent: userAgent,
                        em: [hashData(email)], 
                        
                        // Telefon (Hashed)
                        ph: [hashData(cleanPhone)],
                        
                        // İsim (Hashed - Opsiyonel ama kaliteyi artırır)
                        fn: [hashData(name ? name.split(" ")[0] : "")],
                    },
                    custom_data: {
                        currency: "TRY",
                        value: 250.0,
                        content_name: "Ucretsiz On Gorusme Formu"
                    }
                }
            ]
        };

        // Facebook'a isteği gönder (Arka planda)
        axios.post(
            `https://graph.facebook.com/v17.0/${process.env.FACEBOOK_PIXEL_ID}/events?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
            fbEventData
        ).then(response => {
            console.log("✅ Facebook CAPI Başarılı: Event gönderildi.");
        }).catch(error => {
            console.error("❌ Facebook CAPI Hatası:", error.response ? error.response.data : error.message);
        });
    }


    res.status(201).json({ success: true, message: "Başvuru alındı" });

  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};

