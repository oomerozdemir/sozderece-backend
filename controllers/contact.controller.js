import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import axios from "axios"; // Facebook isteği için gerekli
import crypto from "crypto"; // Şifreleme için gerekli

dotenv.config();

// Facebook için veriyi şifreleme (Hashing) fonksiyonu
const hashData = (data) => {
  if (!data) return null;
  return crypto.createHash("sha256").update(data).digest("hex");
};

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
    const { name, email, phone, userType, message } = req.body;

    // 1. Kullanıcının IP ve Tarayıcı bilgisini al (Facebook eşleşmesi için kritik)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!name || !email || !phone || !userType || !message) {
      return res.status(400).json({
        success: false,
        message: "Tüm alanlar zorunludur.",
      });
    }

    // 2. Veritabanına Kayıt
    await prisma.trialMeeting.create({
      data: { name, email, phone, userType, message }
    });

    // 3. Mail Gönderimi
    transporter.sendMail({
      from: '"Sözderece Koçluk" <iletisim@sozderecekocluk.com>',
      to: "iletisim@sozderecekocluk.com", 
      subject: "Yeni Ücretsiz Ön Görüşme Talebi (Web)",
      html: `
        <h3>Yeni Başvuru Geldi! 🚀</h3>
        <p><strong>Ad:</strong> ${name}</p>
        <p><strong>Telefon:</strong> ${phone}</p>
        <p><strong>Kullanıcı Tipi:</strong> ${userType}</p>
        <p><strong>Mesaj:</strong> ${message}</p>
        <hr>
        <p><small>Email (Sistem): ${email}</small></p>
      `,
    }).catch(err => console.error("Mail gönderilemedi:", err));

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
                        client_user_agent: userAgent
                        // E-postayı bilerek göndermiyoruz çünkü dummy email kullanıyoruz.
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

    res.status(201).json({ success: true, message: "Talep alındı" });

  } catch (err) {
    console.error("CreateTrialMeeting Hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};