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

const LGS_SETTINGS_KEY = "lgsSettings";
const LGS_CONTENT_KEY = "lgsContent";
const DEFAULT_MAX_QUOTA = 10;

const DEFAULT_LGS_CONTENT = {
  lgsDate: "2026-06-14",
  hero: {
    subtitle: "Her gün yanında biri var — koçu, planı, sistemi.",
    chip1: "📅 LGS'ye kadar günlük takip",
    chip2: "👨‍👩‍👧 Haftalık veli raporu",
    ctaPrimary: "⚡ Yerimi Şimdi Ayırt →",
    ctaSecondary: "📞 Önce Konuşalım",
    navbarCta: "Yerimi Ayırt →",
  },
  painPoints: {
    title: "Tanıdık geliyor mu?",
    subtitle: "Pek çok velinin yaşadığı sorunlar — çözümsüz değil.",
    items: [
      { emoji: "📚", title: "Çalışıyor ama sonuç alamıyor", desc: "Masa başında saatler geçiyor, denemeler yerinde sayıyor." },
      { emoji: "📱", title: "Telefonu bir türlü bıraktıramıyorsunuz", desc: "Her 20 dakikada bir telefon, her seferinde sıfırdan başlıyor." },
      { emoji: "🤷", title: "Ödevleri yapıp yapmadığını bilemiyorsunuz", desc: "Yaptım diyor ama emin olamıyorsunuz." },
      { emoji: "❓", title: "LGS'ye nasıl hazırlanılır bilmiyorsunuz", desc: "Hangi kaynak, hangi konu, ne kadar süre — cevabı yok." },
      { emoji: "😔", title: "Stres ve motivasyon iniş çıkış", desc: "Bir gün hevesli, ertesi gün hiç çalışmak istemiyor." },
    ],
  },
  howItWorks: {
    steps: [
      { title: "Çocuğunuzu tanıyoruz", desc: "Hangi konular zayıf, nerede takılıyor, asıl sorun ne. Bunu anlamadan plan kurmak işe yaramıyor." },
      { title: "Günlük plan, günlük takip", desc: "Her gün ne çalışacağı belli. Telefon kullanımı da planlanıyor. Ödevler takip ediliyor." },
      { title: "Sizi de bilgilendiriyoruz", desc: "Haftalık ilerleme raporu veliye. Çocuğunuzun sürecini uzaktan görebiliyorsunuz." },
    ],
    comparisonTitle: "Neden Sözderece?",
    comparisonCta: "Hemen Kayıt Ol →",
    comparison: [
      { label: "Günlük plan" },
      { label: "Deneme analizi" },
      { label: "Telefon yönetimi" },
      { label: "Veli bilgilendirmesi" },
      { label: "Motivasyon takibi" },
    ],
  },
  socialProof: {
    title: "Sadece söz değil —",
    titleAccent: "aileler konuşuyor",
    subtitle: "",
    stats: [
      { icon: "", val: "21", label: "Aktif öğrenci", desc: "" },
      { icon: "", val: "📋", label: "Haftalık veli raporu", desc: "" },
    ],
    testimonials: [
      { quote: "Kızım çalışıyordu ama sonuç alamıyordu. İki hafta sonra ağladım — ilerliyordu.", author: "8. Sınıf Öğrenci Velisi", isParent: true },
      { quote: "Başka koçluktan geliyorum. Orada haftalık mesaj atıyorlardı. Burada koçum her gün ne çalıştığımı biliyor.", author: "Elif, LGS Öğrencisi", isParent: false },
    ],
  },
  offer: {
    title: "LGS'ye Kadar Yanındayız",
    subtitle: "Planını seç, hemen başla.",
    price: "2500",
    priceLabel: "LGS'ye kadar — tek seferlik",
    buyLink: "/paket-detay",
    ctaPrimary: "⚡ Yerimi Ayırt",
    ctaSecondary: "📞 Önce Konuşalım",
    plans: [
      {
        label: "2 Aylık Plan",
        price: "1500",
        oldPrice: "",
        priceText: "/ 2 ay",
        desc: "Hızlı ivme kazanmak isteyenler için",
        badge: "",
        isFeatured: false,
        ctaText: "Başla",
        includes: [],
      },
      {
        label: "LGS'ye Kadar",
        price: "2500",
        oldPrice: "",
        priceText: "/ LGS'ye kadar",
        desc: "Sınava kadar tam destek, tek seferlik ödeme",
        badge: "En İyi Değer",
        isFeatured: true,
        ctaText: "⚡ Yerimi Ayırt",
        includes: [],
      },
    ],
    includes: [
      "Günlük kişisel çalışma planı",
      "Haftalık deneme analizi",
      "Telefon yönetimi desteği",
      "Haftalık veli raporu",
      "Motivasyon koçluğu",
    ],
  },
  form: {
    title: "Hâlâ sorunuz var mı?",
    subtitle: "Formu doldurun, sizi arayalım.",
    submitText: "Gönder, Sizi Arayalım →",
    successTitle: "Başvurunuz alındı!",
    successSubtitle: "En kısa sürede sizi arayacağız.",
  },
  faq: {
    title: "Sık Sorulan Sorular",
    items: [
      { question: "LGS Hazırlık programı hangi sınıflar için uygundur?", answer: "Program, 7. ve 8. sınıf öğrencileri için tasarlanmıştır. Her iki sınıf için de ayrı kişisel planlar hazırlanır." },
      { question: "Çocuğum çok geri kaldı, yine de fayda görür mü?", answer: "Evet. Koçumuz önce mevcut durumu analiz eder ve gerçekçi bir yol haritası çizer. Geç kalmış yoktur, doğru yönlendirme her şeyi değiştirir." },
      { question: "Veli olarak süreçte nasıl yer alıyorum?", answer: "Haftalık veli raporu ile çocuğunuzun ilerlemesini takip edebilirsiniz. Ayrıca talep ettiğinizde koçla birebir görüşme yapabilirsiniz." },
      { question: "Görüşmeler nasıl gerçekleşiyor?", answer: "Tüm görüşmeler online (Zoom veya Google Meet) yapılır. Haftada en az bir koç görüşmesi ve WhatsApp üzerinden günlük takip sağlanır." },
      { question: "Ücret iadesi mümkün mü?", answer: "Evet. Kayıt tarihinden itibaren ilk 5 gün içinde koşulsuz iade hakkınız bulunuyor." },
    ],
  },
};

export const getLgsContent = async (req, res) => {
  try {
    const record = await prisma.siteSettings.findUnique({ where: { key: LGS_CONTENT_KEY } });
    if (!record) return res.json(DEFAULT_LGS_CONTENT);
    return res.json(JSON.parse(record.value));
  } catch (err) {
    console.error("getLgsContent error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const updateLgsContent = async (req, res) => {
  try {
    const value = JSON.stringify(req.body);
    await prisma.siteSettings.upsert({
      where: { key: LGS_CONTENT_KEY },
      update: { value },
      create: { key: LGS_CONTENT_KEY, value },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("updateLgsContent error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const getLgsSettings = async (req, res) => {
  try {
    const [settingRecord, appCount] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { key: LGS_SETTINGS_KEY } }),
      prisma.lgsApplication.count(),
    ]);
    const settings = settingRecord ? JSON.parse(settingRecord.value) : { maxQuota: DEFAULT_MAX_QUOTA };
    const maxQuota = settings.maxQuota || DEFAULT_MAX_QUOTA;
    const remainingQuota = Math.max(0, maxQuota - appCount);
    return res.json({ maxQuota, remainingQuota, totalApplications: appCount });
  } catch (err) {
    console.error("getLgsSettings error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const updateLgsSettings = async (req, res) => {
  try {
    const { maxQuota } = req.body;
    const value = JSON.stringify({ maxQuota: parseInt(maxQuota) || DEFAULT_MAX_QUOTA });
    await prisma.siteSettings.upsert({
      where: { key: LGS_SETTINGS_KEY },
      update: { value },
      create: { key: LGS_SETTINGS_KEY, value },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("updateLgsSettings error:", err);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

export const submitLgsApplication = async (req, res) => {
  try {
    const { name, phone, grade, message, type = "call" } = req.body;

    if (!name || !phone || !grade) {
      return res.status(400).json({ success: false, message: "Ad, telefon ve sınıf zorunludur." });
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: "Geçerli bir telefon numarası giriniz." });
    }

    const application = await prisma.lgsApplication.create({
      data: { name, phone: cleanPhone, grade, message: message || null, type },
    });

    const adminEmail = process.env.ADMIN_EMAIL || "iletisim@sozderecekocluk.com";
    // Kullanıcı verileri HTML escape edilerek mail injection önleniyor
    const safe = {
      name: escapeHtml(name),
      phone: escapeHtml(cleanPhone),
      grade: escapeHtml(grade),
      message: escapeHtml(message || ""),
    };
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;border-radius:12px">
        <div style="background:#100481;color:white;padding:24px;border-radius:10px 10px 0 0;text-align:center">
          <h2 style="margin:0;font-size:22px">📚 Yeni LGS Hazırlık Başvurusu</h2>
        </div>
        <div style="background:white;padding:24px;border-radius:0 0 10px 10px">
          <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;font-weight:bold;text-align:center;padding:10px 16px;border-radius:8px;margin-bottom:20px;font-size:14px">📞 GERİ ARAMA TALEBİ</div>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151;width:40%">Ad Soyad</td><td style="padding:10px 14px;color:#111827">${safe.name}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Telefon</td><td style="padding:10px 14px;color:#111827">${safe.phone}</td></tr>
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151">Sınıf</td><td style="padding:10px 14px;color:#111827">${safe.grade}</td></tr>
            ${safe.message ? `<tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Mesaj</td><td style="padding:10px 14px;color:#111827">${safe.message}</td></tr>` : ""}
          </table>
          <p style="font-size:12px;color:#9ca3af;margin-top:20px;text-align:center">Başvuru No: #${application.id} — ${new Date().toLocaleString("tr-TR")}</p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: adminEmail,
        subject: `[Sözderece] Yeni LGS Başvurusu — ${name}`,
        html,
      });
    } catch (mailErr) {
      console.error("LGS başvuru maili gönderilemedi:", mailErr.message);
    }

    return res.status(201).json({ success: true, message: "Başvurunuz alındı, en kısa sürede sizi arayacağız." });
  } catch (err) {
    console.error("submitLgsApplication error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const listLgsApplications = async (req, res) => {
  try {
    const [applications, settingRecord] = await Promise.all([
      prisma.lgsApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.siteSettings.findUnique({ where: { key: LGS_SETTINGS_KEY } }),
    ]);
    const settings = settingRecord ? JSON.parse(settingRecord.value) : { maxQuota: DEFAULT_MAX_QUOTA };
    const maxQuota = settings.maxQuota || DEFAULT_MAX_QUOTA;
    const remainingQuota = Math.max(0, maxQuota - applications.length);
    return res.json({ success: true, applications, total: applications.length, maxQuota, remainingQuota });
  } catch (err) {
    console.error("listLgsApplications error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const exportLgsCsv = async (req, res) => {
  try {
    const applications = await prisma.lgsApplication.findMany({ orderBy: { createdAt: "desc" } });
    const header = "ID,Ad Soyad,Telefon,Sınıf,Mesaj,Tür,Tarih";
    const rows = applications.map((a) =>
      [a.id, `"${a.name}"`, a.phone, a.grade, `"${a.message || ""}"`, a.type, new Date(a.createdAt).toLocaleString("tr-TR")].join(",")
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=lgs-applications.csv");
    return res.send("\uFEFF" + csv);
  } catch (err) {
    console.error("exportLgsCsv error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};
