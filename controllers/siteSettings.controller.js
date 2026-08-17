import prisma from "../utils/prisma.js";

const COUNTDOWN_KEY = "countdown";
const POPUP_KEY = "discountPopup";
const PAYMENT_PAGE_KEY = "paymentPage";
const EARLY_REG_KEY = "earlyRegistration";
const PRICING_VIDEO_KEY = "pricingVideo";

const DEFAULT_PRICING_VIDEO = {
  enabled: false,
  videoUrl: "",
};

const DEFAULT_EARLY_REG = {
  enabled: false,
  badge: "🎉 Erken Kayıt Kampanyası",
  title: "Erken Kayıt Fırsatını Kaçırma!",
  subtitle: "Sınav öncesi başla, daha az öde. Bu fiyatlarla sınırlı süre.",
  endDate: null,
  discountText: "%20 İndirim",
  ctaText: "Hemen Kaydol →",
  note: "⚡ Sınırlı kontenjan",
};

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
  guaranteeText: "Siparişinizi teslim aldıktan sonra 14 gün içinde koşulsuz cayma hakkınız bulunmaktadır.",
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

// GET /api/settings/early-registration - Herkese açık
export const getEarlyRegistration = async (req, res) => {
  try {
    const setting = await prisma.siteSettings.findUnique({ where: { key: EARLY_REG_KEY } });
    if (!setting) return res.json(DEFAULT_EARLY_REG);
    return res.json(JSON.parse(setting.value));
  } catch (err) {
    console.error("getEarlyRegistration error:", err);
    res.status(500).json({ message: "Erken kayıt ayarları alınamadı." });
  }
};

// PUT /api/admin/settings/early-registration - Admin only
export const updateEarlyRegistration = async (req, res) => {
  try {
    const { enabled, badge, title, subtitle, endDate, discountText, ctaText, note } = req.body;
    const value = JSON.stringify({ enabled, badge, title, subtitle, endDate, discountText, ctaText, note });
    await prisma.siteSettings.upsert({
      where: { key: EARLY_REG_KEY },
      update: { value },
      create: { key: EARLY_REG_KEY, value },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("updateEarlyRegistration error:", err);
    res.status(500).json({ message: "Erken kayıt ayarları kaydedilemedi." });
  }
};

// GET /api/settings/pricing-video - Herkese açık
export const getPricingVideo = async (req, res) => {
  try {
    const setting = await prisma.siteSettings.findUnique({ where: { key: PRICING_VIDEO_KEY } });
    if (!setting) return res.json(DEFAULT_PRICING_VIDEO);
    return res.json(JSON.parse(setting.value));
  } catch (err) {
    console.error("getPricingVideo error:", err);
    res.status(500).json({ message: "Video ayarları alınamadı." });
  }
};

// PUT /api/admin/settings/pricing-video - Admin only
export const updatePricingVideo = async (req, res) => {
  try {
    const { enabled, videoUrl } = req.body;
    const value = JSON.stringify({ enabled: !!enabled, videoUrl: videoUrl || "" });
    await prisma.siteSettings.upsert({
      where: { key: PRICING_VIDEO_KEY },
      update: { value },
      create: { key: PRICING_VIDEO_KEY, value },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("updatePricingVideo error:", err);
    res.status(500).json({ message: "Video ayarları kaydedilemedi." });
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
