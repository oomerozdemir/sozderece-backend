import prisma from "../utils/prisma.js";
import { sendEmail } from "../utils/sendEmail.js";

// Mail template'inde HTML Injection'a karşı kullanıcı verilerini escape eder
const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const YKS_SETTINGS_KEY = "yksSettings";
const YKS_CONTENT_KEY = "yksContent";
const DEFAULT_MAX_QUOTA = 10;

const DEFAULT_YKS_CONTENT = {
  yksDate: "2027-06-20",
  hero: {
    titleAccent: "YKS Yolculuğunda Koçun Yanında Olsun.",
    subtitle: "Günlük plan, anlık takip, deneme analizi: hepsi bir arada.",
    chip1: "Kişisel Koç",
    chip2: "📊 Deneme Analizi",
    ctaPrimary: "⚡ Yerimi Şimdi Ayırt →",
    navbarCta: "Yerimi Ayırt →",
  },
  painPoints: {
    title: "Tanıdık geliyor mu?",
    subtitle: "Pek çok öğrencinin yaşadığı sorunlar, çözümsüz değil.",
    items: [
      { title: "Net sayım artmıyor", desc: "Saatler çalışıyorsun ama denemede aynı yanlışlar tekrar ediyor." },
      { title: "Program tutmuyor", desc: "Hazırladığın planlar ilk haftada çöküyor, nereye odaklanacağını bilemiyorsun." },
      { title: "Motivasyon iniyor", desc: "Deneme sonuçları sonra gelen hayal kırıklığı tüm enerjini tüketiyor." },
      { title: "Nasıl başlayacaksın?", desc: "YKS devi büyük görünüyor, hangi konudan başlayacağını bilemiyorsun." },
    ],
  },
  howItWorks: {
    steps: [
      { title: "İlk Görüşme", desc: "Ücretsiz tanışma görüşmesiyle mevcut durumun analiz edilir, hedeflerin netleştirilir." },
      { title: "Kişisel Plan", desc: "Koçun sana özel haftalık çalışma planı hazırlar. Günlük WhatsApp takibi başlar." },
      { title: "Deneme Analizi", desc: "Her deneme sonrası 24 saat içinde detaylı analiz yapılır, zayıf konular önceliklendirilir." },
    ],
    comparisonTitle: "Neden Sözderece?",
    comparisonCta: "Hemen Kayıt Ol →",
    comparison: [
      { label: "Kişisel koç takibi" },
      { label: "Günlük WhatsApp iletişimi" },
      { label: "Deneme analizi (24 saat)" },
      { label: "Veli raporlaması" },
      { label: "Koç değiştirme hakkı" },
    ],
  },
  socialProof: {
    title: "Sadece söz değil,",
    titleAccent: "öğrenciler konuşuyor",
    subtitle: "",
    stats: [],
    testimonials: [],
  },
  offer: {
    title: "YKS'ye Kadar Yanındayız",
    subtitle: "Planını seç, hemen başla.",
    price: "2800",
    priceLabel: "4 haftalık program",
    buyLink: "/paket-detay",
    ctaPrimary: "⚡ Yerimi Ayırt",
    ctaSecondary: "📞 Önce Konuşalım",
    plans: [],
    includes: [
      "Günlük WhatsApp koç takibi",
      "Haftalık deneme analizi",
      "Veli raporlaması",
      "Kişisel çalışma planı",
    ],
  },
  form: {
    title: "Sorunuz var mı?",
    subtitle: "Formu doldurun, sizi arayalım.",
    submitText: "Gönder, Sizi Arayalım →",
    successTitle: "Başvurunuz alındı!",
    successSubtitle: "En kısa sürede sizi arayacağız.",
  },
  faq: {
    title: "Sık Sorulan Sorular",
    items: [
      { question: "YKS Koçluğu hangi sınıflar için uygundur?", answer: "Program, 9-12. sınıf ve mezun öğrenciler için tasarlanmıştır. Her öğrenci için ayrı bir kişisel plan hazırlanır." },
      { question: "Net sayım çok düşük, yine de fayda görür müyüm?", answer: "Evet. Koçun önce mevcut durumunu analiz eder ve gerçekçi bir yol haritası çizer. Geç kalmış yoktur, doğru yönlendirme her şeyi değiştirir." },
      { question: "Görüşmeler nasıl gerçekleşiyor?", answer: "Tüm görüşmeler online (Zoom veya Google Meet) yapılır. Haftada en az bir koç görüşmesi ve WhatsApp üzerinden günlük takip sağlanır." },
      { question: "Ücret iadesi mümkün mü?", answer: "Evet. Kayıt tarihinden itibaren ilk 14 gün içinde koşulsuz iade hakkınız bulunuyor." },
    ],
  },
};

export const getYksContent = async (req, res) => {
  try {
    const record = await prisma.siteSettings.findUnique({ where: { key: YKS_CONTENT_KEY } });
    if (!record) return res.json(DEFAULT_YKS_CONTENT);
    return res.json(JSON.parse(record.value));
  } catch (err) {
    console.error("getYksContent error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const updateYksContent = async (req, res) => {
  try {
    const value = JSON.stringify(req.body);
    await prisma.siteSettings.upsert({
      where: { key: YKS_CONTENT_KEY },
      update: { value },
      create: { key: YKS_CONTENT_KEY, value },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("updateYksContent error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const getYksSettings = async (req, res) => {
  try {
    const [settingRecord, appCount] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { key: YKS_SETTINGS_KEY } }),
      prisma.yksApplication.count(),
    ]);
    const settings = settingRecord ? JSON.parse(settingRecord.value) : { maxQuota: DEFAULT_MAX_QUOTA };
    const maxQuota = settings.maxQuota || DEFAULT_MAX_QUOTA;
    const remainingQuota = Math.max(0, maxQuota - appCount);
    return res.json({ maxQuota, remainingQuota, totalApplications: appCount });
  } catch (err) {
    console.error("getYksSettings error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const updateYksSettings = async (req, res) => {
  try {
    const { maxQuota } = req.body;
    const value = JSON.stringify({ maxQuota: parseInt(maxQuota) || DEFAULT_MAX_QUOTA });
    await prisma.siteSettings.upsert({
      where: { key: YKS_SETTINGS_KEY },
      update: { value },
      create: { key: YKS_SETTINGS_KEY, value },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("updateYksSettings error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const submitYksApplication = async (req, res) => {
  try {
    const { name, phone, grade, message, type = "call" } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Ad ve telefon zorunludur." });
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: "Geçerli bir telefon numarası giriniz." });
    }

    const application = await prisma.yksApplication.create({
      data: { name, phone: cleanPhone, grade: grade || "", message: message || null, type },
    });

    const adminEmail = process.env.ADMIN_EMAIL || "iletisim@sozderecekocluk.com";
    // Kullanıcı verileri HTML escape edilerek mail injection önleniyor
    const safe = {
      name: escapeHtml(name),
      phone: escapeHtml(cleanPhone),
      grade: escapeHtml(grade || ""),
      message: escapeHtml(message || ""),
    };
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;border-radius:12px">
        <div style="background:#100481;color:white;padding:24px;border-radius:10px 10px 0 0;text-align:center">
          <h2 style="margin:0;font-size:22px">🎓 Yeni YKS Yolculuğu Başvurusu</h2>
        </div>
        <div style="background:white;padding:24px;border-radius:0 0 10px 10px">
          <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;font-weight:bold;text-align:center;padding:10px 16px;border-radius:8px;margin-bottom:20px;font-size:14px">📞 GERİ ARAMA TALEBİ</div>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151;width:40%">Ad Soyad</td><td style="padding:10px 14px;color:#111827">${safe.name}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Telefon</td><td style="padding:10px 14px;color:#111827">${safe.phone}</td></tr>
            ${safe.grade ? `<tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151">Sınıf</td><td style="padding:10px 14px;color:#111827">${safe.grade}</td></tr>` : ""}
            ${safe.message ? `<tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Mesaj</td><td style="padding:10px 14px;color:#111827">${safe.message}</td></tr>` : ""}
          </table>
          <p style="font-size:12px;color:#9ca3af;margin-top:20px;text-align:center">Başvuru No: #${application.id}, ${new Date().toLocaleString("tr-TR")}</p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: adminEmail,
        subject: `[Sözderece] Yeni YKS Başvurusu: ${name}`,
        html,
      });
    } catch (mailErr) {
      console.error("YKS başvuru maili gönderilemedi:", mailErr.message);
    }

    return res.status(201).json({ success: true, message: "Başvurunuz alındı, en kısa sürede sizi arayacağız." });
  } catch (err) {
    console.error("submitYksApplication error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const listYksApplications = async (req, res) => {
  try {
    const [applications, settingRecord] = await Promise.all([
      prisma.yksApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.siteSettings.findUnique({ where: { key: YKS_SETTINGS_KEY } }),
    ]);
    const settings = settingRecord ? JSON.parse(settingRecord.value) : { maxQuota: DEFAULT_MAX_QUOTA };
    const maxQuota = settings.maxQuota || DEFAULT_MAX_QUOTA;
    const remainingQuota = Math.max(0, maxQuota - applications.length);
    return res.json({ success: true, applications, total: applications.length, maxQuota, remainingQuota });
  } catch (err) {
    console.error("listYksApplications error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

const VALID_LEAD_STATUSES = ["new", "contacted", "converted", "no-show"];

export const updateYksApplicationStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!VALID_LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum değeri." });
    }
    const updated = await prisma.yksApplication.update({ where: { id }, data: { status } });
    return res.json({ success: true, application: updated });
  } catch (err) {
    console.error("updateYksApplicationStatus error:", err);
    return res.status(500).json({ success: false, message: "Durum güncellenemedi." });
  }
};

export const deleteYksApplication = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.yksApplication.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteYksApplication error:", err);
    return res.status(500).json({ success: false, message: "Başvuru silinemedi." });
  }
};

export const exportYksCsv = async (req, res) => {
  try {
    const applications = await prisma.yksApplication.findMany({ orderBy: { createdAt: "desc" } });
    const header = "ID,Ad Soyad,Telefon,Sınıf,Mesaj,Tür,Tarih";
    const rows = applications.map((a) =>
      [a.id, `"${a.name}"`, a.phone, a.grade, `"${a.message || ""}"`, a.type, new Date(a.createdAt).toLocaleString("tr-TR")].join(",")
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=yks-applications.csv");
    return res.send("﻿" + csv);
  } catch (err) {
    console.error("exportYksCsv error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};
