import prisma from "../utils/prisma.js";

const COUNTDOWN_KEY = "countdown";
const POPUP_KEY = "discountPopup";

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
