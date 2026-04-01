import prisma from "../utils/prisma.js";

const COUNTDOWN_KEY = "countdown";
const POPUP_KEY = "discountPopup";
const PAYMENT_PAGE_KEY = "paymentPage";

const DEFAULT_PAYMENT_SETTINGS = {
  logoUrl: "/images/hero-logo.webp",
  slogan: "Başarıya giden yol buradan geçiyor",
  socialProofText: "+200 Mutlu Öğrenci",
  socialProofStars: 5,
  avatars: [
    { initials: "AY", color: "#f39c12" },
    { initials: "MK", color: "#100481" },
    { initials: "ZD", color: "#e74c3c" },
  ],
  includes: [
    "Rehberlik Videoları",
    "Adım Adım Belgeler ve Şablonlar",
    "Özel Topluluğa Erişim",
    "Kurs Güncellemelerine Ömür Boyu Erişim",
  ],
  guaranteeText: "Siparişinizi teslim aldıktan sonra 5 gün içinde koşulsuz cayma hakkınız bulunmaktadır.",
  ctaButtonText: "Güvenli Ödemeye Geç",
};

// GET /api/settings/countdown - Herkese açık
export const getCountdown = async (req, res) => {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: COUNTDOWN_KEY },
    });

    if (!setting) {
      return res.json({
        enabled: false,
        targetDate: null,
        title: "",
        subtitle: "",
      });
    }

    const data = JSON.parse(setting.value);
    return res.json(data);
  } catch (err) {
    console.error("getCountdown error:", err);
    res.status(500).json({ message: "Ayarlar alınamadı." });
  }
};

// GET /api/settings/popup - Herkese açık
export const getPopup = async (req, res) => {
  try {
    const setting = await prisma.siteSettings.findUnique({ where: { key: POPUP_KEY } });
    if (!setting) {
      return res.json({ enabled: false, title: "", couponCode: "", discountText: "", description: "", delaySeconds: 2 });
    }
    return res.json(JSON.parse(setting.value));
  } catch (err) {
    console.error("getPopup error:", err);
    res.status(500).json({ message: "Popup ayarları alınamadı." });
  }
};

// PUT /api/admin/settings/popup - Admin only
export const updatePopup = async (req, res) => {
  try {
    const { enabled, title, couponCode, discountText, description, delaySeconds } = req.body;
    const value = JSON.stringify({ enabled, title, couponCode, discountText, description, delaySeconds });
    await prisma.siteSettings.upsert({
      where: { key: POPUP_KEY },
      update: { value },
      create: { key: POPUP_KEY, value },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("updatePopup error:", err);
    res.status(500).json({ message: "Popup ayarları kaydedilemedi." });
  }
};

// GET /api/settings/payment-page - Herkese açık
export const getPaymentPageSettings = async (req, res) => {
  try {
    const setting = await prisma.siteSettings.findUnique({ where: { key: PAYMENT_PAGE_KEY } });
    if (!setting) return res.json(DEFAULT_PAYMENT_SETTINGS);
    return res.json(JSON.parse(setting.value));
  } catch (err) {
    console.error("getPaymentPageSettings error:", err);
    res.status(500).json({ message: "Ödeme sayfası ayarları alınamadı." });
  }
};

// PUT /api/admin/settings/payment-page - Admin only
export const updatePaymentPageSettings = async (req, res) => {
  try {
    const value = JSON.stringify(req.body);
    await prisma.siteSettings.upsert({
      where: { key: PAYMENT_PAGE_KEY },
      update: { value },
      create: { key: PAYMENT_PAGE_KEY, value },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("updatePaymentPageSettings error:", err);
    res.status(500).json({ message: "Ödeme sayfası ayarları kaydedilemedi." });
  }
};

// PUT /api/admin/settings/countdown - Admin only
export const updateCountdown = async (req, res) => {
  try {
    const { enabled, targetDate, title, subtitle } = req.body;

    const value = JSON.stringify({ enabled, targetDate, title, subtitle });

    await prisma.siteSettings.upsert({
      where: { key: COUNTDOWN_KEY },
      update: { value },
      create: { key: COUNTDOWN_KEY, value },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("updateCountdown error:", err);
    res.status(500).json({ message: "Ayarlar kaydedilemedi." });
  }
};
