import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../utils/sendEmail.js";

const prisma = new PrismaClient();

const DEFAULT_CONTENT = {
  isActive: true,
  slug: "deneme-kampi",
  name: "Deneme Kampı",
  hero: {
    title: "Denemeler Artık Seni Korkutmasın —",
    titleLine2: "Sınava Kadar Her Şey Kontrol Altında",
    subtitle: "Eğer her gün masa başına oturup kalkıyorsun ama denemende hâlâ aynı yerdesin, sorun motivasyon değil — plan.",
    videoUrl: "",
    buttonText: "Yerini Ayırt",
    chip1: "✅ Sınava Kadar Takip",
    chip2: "🎯 Kontenjan Dolmadan Kayıt Ol",
    socialProofText: "+124 Mutlu Öğrenci",
    socialProofAvatars: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
    highlightPhrase: "Sözderece ile",
    ctaBadges: [
      { text: "+124 Mutlu Öğrenci", icon: "👥" },
      { text: "★★★★★ 4.7 Puan", icon: "" },
    ],
  },
  painPoints: {
    title: "Bu sen misin?",
    items: [
      { icon: "📉", title: "Deneme sonuçların tutarsız", desc: "Bir hafta yükseliyor, ertesi hafta düşüyor. Ne yaptığını bilemiyorsun." },
      { icon: "🗂", title: "Her konuya atlıyorsun ama hiçbirini bitirmiyorsun", desc: "Kafanda sürekli şu konuyu çalışmalıyım var ama saat 22:00 olunca erteliyorsun." },
      { icon: "⏰", title: "Sınava az kaldı ve panikliyorsun", desc: "Geç mi kaldım sorusu kafanı meşgul ediyor. Doğru adımı atmak için zaman daralıyor." },
      { icon: "😶", title: "Yanında rehberlik edecek biri yok", desc: "Dershane genel anlatıyor, özel ders tek konuya giriyor. Sistemi kuracak kimse yok." },
    ],
  },
  camp: {
    title: "Deneme Kampı Nedir?",
    description: "Sözderece Deneme Kampı; sınav gününe kadar her hafta sistematik deneme analizi, koç takibi ve WhatsApp ile günlük kontrol sağlayan bir program.",
    weeks: [
      { week: "1. Hafta", title: "Seviye Tespiti & Hedef", desc: "Koçunla ilk görüşme, mevcut durum analizi ve kişiye özel hedef belirleme." },
      { week: "2–3. Hafta", title: "Deneme Analizi Döngüsü", desc: "Her denemeden sonra koçunla analiz, yanlış konu tespiti, öncelik sıralaması." },
      { week: "Her Hafta", title: "Plan Güncelleme", desc: "Haftalık program güncelleme, motivasyon desteği, veli bilgilendirmesi." },
    ],
    comparisonTitle: "Neden Sözderece?",
    comparison: [
      { feature: "Günlük WhatsApp Takibi", sozderece: true, dershane: false, tekli: false },
      { feature: "Deneme Analizi", sozderece: true, dershane: false, tekli: true },
      { feature: "7/24 Destek", sozderece: true, dershane: false, tekli: false },
      { feature: "Kişiye Özel Plan", sozderece: true, dershane: false, tekli: true },
      { feature: "Veli Bilgilendirmesi", sozderece: true, dershane: false, tekli: false },
      { feature: "Haftalık Görüşme", sozderece: true, dershane: false, tekli: true },
    ],
    comparisonRating: "★★★★★ 4.7",
    comparisonCTAText: "Hemen Kayıt Ol",
  },
  testimonials: {
    title: "Kanıtlanmış Sonuçlar",
    stats: [
      { number: "59→70", label: "Net artışı" },
      { number: "+14", label: "Matematikte net" },
      { number: "21", label: "Aktif öğrenci" },
    ],
    items: [
      { name: "Sevval", text: "Koçum sayesinde denemelerimde 64.75ten 82.25e çıktım. Her gün yanımda biri olduğunu hissediyordum.", badge: "+17.5 net" },
      { name: "Elif", text: "Önceden başka koçluk aldım ama fark etmedim. Sözderece sistemini gördükten sonra motivasyonum hiç düşmedi.", badge: "+15 net" },
      { name: "Öğrenci", text: "Her gün timer fotoğrafı atmak disiplin kazandırdı. Artık oturunca odaklanabiliyorum.", badge: "Disiplin" },
    ],
  },
  offer: {
    title: "Sınava Kadar Koçluk Kampı",
    price: "2500",
    maxQuota: 10,
    yksDate: "2027-06-20",
    plans: [
      {
        label: "Aylık",
        price: "850",
        oldPrice: "",
        priceText: "/ ay",
        desc: "Esnek, istediğinde iptal",
        badge: "",
        isFeatured: false,
        ctaText: "Aylık Başla",
        includes: [],
      },
      {
        label: "Sınava Kadar",
        price: "2500",
        oldPrice: "3200",
        priceText: "toplam",
        desc: "12 haftaya kadar tam destek",
        badge: "En İyi Değer",
        isFeatured: true,
        ctaText: "Hemen Başla",
        includes: [],
      },
    ],
    includes: [
      "Sınava kadar haftalık koç görüşmesi",
      "7/24 WhatsApp takibi",
      "Her denemeden sonra analiz",
      "Kişiye özel haftalık program güncelleme",
      "Veli bilgilendirmesi",
    ],
    guarantees: ["5 gün koşulsuz iade", "Güvenli iletişim", "Derece koç desteği"],
    ctaButtonText: "Hemen Başla",
  },
  form: {
    title: "Yerini Şimdi Ayırt",
    subtitle: "Kontenjan dolmadan başvurunu tamamla. Ücretsiz ön görüşme ile başla.",
    freeButtonText: "🆓 Ücretsiz Görüşme",
    freeButtonSub: "Tanışalım, ihtiyacını anlayalım",
    paidButtonText: "💳 Hemen Başla",
    successTitle: "Başvurun Alındı!",
    successText: "En kısa sürede seninle iletişime geçeceğiz.",
  },
  faq: {
    title: "Sık Sorulan Sorular",
    items: [
      { question: "Deneme Kampı ne kadar sürer?", answer: "Kamp, sınav tarihine kadar devam eder. Aylık plan ile başlayıp dilediğinde tam programa geçebilirsin." },
      { question: "Günlük ne kadar zaman ayırmam gerekiyor?", answer: "Koçunla birlikte belirlediğin programa göre değişir. Ortalama günde 4–6 saatlik, kişiselleştirilmiş çalışma planlanır." },
      { question: "Koçumla nasıl iletişim kuracağım?", answer: "WhatsApp üzerinden günlük takip ve haftada en az bir Zoom/Meet görüşmesi yapılır. Sorularını her zaman iletebilirsin." },
      { question: "Ücret iadesi mümkün mü?", answer: "Evet. İlk 5 gün içinde herhangi bir gerekçe bildirmeksizin koşulsuz iade hakkın var." },
      { question: "Kampa başlamak için deneme çözüyor olmam şart mı?", answer: "Hayır. Koçun ilk görüşmede mevcut durumunu analiz eder ve sıfırdan bir çalışma planı oluşturur." },
    ],
  },
};

export const getCampContent = async (req, res) => {
  try {
    const [record, appCount] = await Promise.all([
      prisma.campPage.findUnique({ where: { key: "content" } }),
      prisma.campApplication.count(),
    ]);
    const content = record ? record.value : DEFAULT_CONTENT;
    const maxQuota = content?.offer?.maxQuota || 10;
    const remainingQuota = Math.max(0, maxQuota - appCount);
    return res.json({ ...content, _quota: { total: appCount, maxQuota, remainingQuota } });
  } catch (err) {
    console.error("getCampContent error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const updateCampContent = async (req, res) => {
  try {
    const value = req.body;
    await prisma.campPage.upsert({
      where: { key: "content" },
      update: { value },
      create: { key: "content", value },
    });
    return res.json({ success: true, message: "İçerik güncellendi." });
  } catch (err) {
    console.error("updateCampContent error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const submitApplication = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, grade, type = "free" } = req.body;

    if (!firstName || !lastName || !phone || !email || !grade) {
      return res.status(400).json({ success: false, message: "Tüm alanlar zorunludur." });
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: "Geçerli bir telefon numarası giriniz." });
    }

    const application = await prisma.campApplication.create({
      data: { firstName, lastName, phone, email, grade, type },
    });

    // Admin mail
    const adminEmail = process.env.ADMIN_EMAIL || "iletisim@sozderecekocluk.com";
    const isPaid = type === "paid";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;border-radius:12px">
        <div style="background:#100481;color:white;padding:24px;border-radius:10px 10px 0 0;text-align:center">
          <h2 style="margin:0;font-size:22px">🏕 Yeni Deneme Kampı Başvurusu</h2>
        </div>
        <div style="background:white;padding:24px;border-radius:0 0 10px 10px">
          ${isPaid ? `<div style="background:#dcfce7;border:1px solid #86efac;color:#166534;font-weight:bold;text-align:center;padding:10px 16px;border-radius:8px;margin-bottom:20px;font-size:14px">💳 ÜCRETLİ BAŞVURU</div>` : `<div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;font-weight:bold;text-align:center;padding:10px 16px;border-radius:8px;margin-bottom:20px;font-size:14px">🆓 ÜCRETSİZ BAŞVURU</div>`}
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151;width:40%">Ad</td><td style="padding:10px 14px;color:#111827">${firstName}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Soyad</td><td style="padding:10px 14px;color:#111827">${lastName}</td></tr>
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151">Telefon</td><td style="padding:10px 14px;color:#111827">${phone}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#374151">E-posta</td><td style="padding:10px 14px;color:#111827">${email}</td></tr>
            <tr style="background:#f1f5f9"><td style="padding:10px 14px;font-weight:bold;color:#374151">Sınıf</td><td style="padding:10px 14px;color:#111827">${grade}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#374151">Başvuru Türü</td><td style="padding:10px 14px;color:#111827">${isPaid ? "Ücretli" : "Ücretsiz"}</td></tr>
          </table>
          <p style="font-size:12px;color:#9ca3af;margin-top:20px;text-align:center">Başvuru No: #${application.id} — ${new Date().toLocaleString("tr-TR")}</p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: adminEmail,
        subject: `🏕 Yeni Deneme Kampı Başvurusu — ${firstName} ${lastName}`,
        html,
      });
    } catch (mailErr) {
      console.error("Başvuru maili gönderilemedi:", mailErr.message);
    }

    return res.status(201).json({ success: true, message: "Başvurunuz alındı." });
  } catch (err) {
    console.error("submitApplication error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const listApplications = async (req, res) => {
  try {
    const [applications, contentRecord] = await Promise.all([
      prisma.campApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.campPage.findUnique({ where: { key: "content" } }),
    ]);
    const content = contentRecord ? contentRecord.value : DEFAULT_CONTENT;
    const maxQuota = content?.offer?.maxQuota || 10;
    const remainingQuota = Math.max(0, maxQuota - applications.length);
    return res.json({ success: true, applications, total: applications.length, maxQuota, remainingQuota });
  } catch (err) {
    console.error("listApplications error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const exportApplicationsCSV = async (req, res) => {
  try {
    const applications = await prisma.campApplication.findMany({ orderBy: { createdAt: "desc" } });
    const header = "ID,Ad,Soyad,Telefon,Email,Sınıf,Tür,Tarih";
    const rows = applications.map((a) =>
      [a.id, a.firstName, a.lastName, a.phone, a.email, a.grade, a.type, new Date(a.createdAt).toLocaleString("tr-TR")].join(",")
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=camp-applications.csv");
    return res.send("\uFEFF" + csv); // BOM for Excel
  } catch (err) {
    console.error("exportApplicationsCSV error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};
