import prisma from "../utils/prisma.js";
import { generateToken } from "../middleware/authMiddleware.js";
import { ensureOnboardingForOrder, ensureOnboardingForUser, sanitizeAnswers, isFormDone } from "../utils/onboarding.js";

const publicOnboarding = (o) => ({
  id: o.id,
  stage: o.stage,
  currentStep: o.currentStep,
  answers: o.answers || {},
  packageName: o.packageName,
  formCompleted: isFormDone(o),
});

async function buildPrefill(userId, onboarding) {
  const [user, order, pkg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
    prisma.order.findUnique({ where: { id: onboarding.orderId }, include: { billingInfo: true } }),
    onboarding.packageSlug ? prisma.package.findUnique({ where: { slug: onboarding.packageSlug }, select: { type: true } }) : null,
  ]);
  const bi = order?.billingInfo;
  const billingName = bi ? `${bi.name || ""} ${bi.surname || ""}`.trim() : "";
  return {
    fullName: user?.name || billingName || "",
    phone: user?.phone || bi?.phone || "",
    exam: pkg?.type === "lgs" ? "LGS" : pkg?.type === "yks" ? "YKS" : "",
    field: bi?.alan && ["Sayısal", "Eşit Ağırlık", "Sözel", "Dil"].includes(bi.alan) ? bi.alan : "",
  };
}

// GET /api/onboarding/me — kullanıcının kendi onboarding'i (yoksa null)
export const getMyOnboarding = async (req, res) => {
  try {
    const onboarding = await ensureOnboardingForUser(req.user.id);
    if (!onboarding) return res.json({ success: true, onboarding: null });
    res.json({ success: true, onboarding: publicOnboarding(onboarding), prefill: await buildPrefill(req.user.id, onboarding) });
  } catch (err) {
    console.error("getMyOnboarding:", err);
    res.status(500).json({ success: false, message: "Onboarding alınamadı." });
  }
};

// PUT /api/onboarding/me  { step, answers } — adım adım kayıt (kısmi cevap birleştirilir)
export const saveMyOnboarding = async (req, res) => {
  try {
    const current = await ensureOnboardingForUser(req.user.id);
    if (!current) return res.status(404).json({ success: false, message: "Onboarding bulunamadı." });

    const patch = sanitizeAnswers(req.body?.answers);
    const step = Math.min(4, Math.max(1, parseInt(req.body?.step) || current.currentStep));
    const data = { answers: { ...(current.answers || {}), ...patch }, currentStep: isFormDone(current) ? current.currentStep : step };
    if (current.stage === "payment_completed") {
      data.stage = "introduction_form_started";
      data.stageTimes = { ...(current.stageTimes || {}), introduction_form_started: new Date().toISOString() };
    }
    const updated = await prisma.onboarding.update({ where: { id: current.id }, data });
    res.json({ success: true, onboarding: publicOnboarding(updated) });
  } catch (err) {
    console.error("saveMyOnboarding:", err);
    res.status(500).json({ success: false, message: "Kaydedilemedi." });
  }
};

// POST /api/onboarding/me/complete
export const completeMyOnboardingForm = async (req, res) => {
  try {
    const current = await ensureOnboardingForUser(req.user.id);
    if (!current) return res.status(404).json({ success: false, message: "Onboarding bulunamadı." });

    const answers = { ...(current.answers || {}), ...sanitizeAnswers(req.body?.answers) };
    // Sadece koçun ulaşabilmesi için gerçekten gerekli alanlar zorunlu; hedef vb. opsiyonel.
    const missing = ["fullName", "phone", "respondent", "exam"].filter((k) => !answers[k]);
    if (missing.length) return res.status(400).json({ success: false, message: "Zorunlu alanlar eksik.", missing });

    const data = { answers, currentStep: 4 };
    if (!isFormDone(current)) {
      data.stage = "introduction_form_completed";
      data.stageTimes = { ...(current.stageTimes || {}), introduction_form_completed: new Date().toISOString() };
    }
    const updated = await prisma.onboarding.update({ where: { id: current.id }, data });

    // Koçun ulaşabileceği güncel iletişim bilgisi hesapta da dursun (boşsa doldur).
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, phone: true } });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { ...(!user?.name ? { name: answers.fullName } : {}), ...(!user?.phone ? { phone: answers.phone } : {}) },
    });

    res.json({ success: true, onboarding: publicOnboarding(updated) });
  } catch (err) {
    console.error("completeMyOnboardingForm:", err);
    res.status(500).json({ success: false, message: "Form tamamlanamadı." });
  }
};

// POST /api/onboarding/claim  { merchantOid }
// Ödeme sonrası misafirin oturumu yok. Tarayıcı, ödemeyi başlatırken aldığı
// (tahmin edilemez) merchantOid ile gelir; sunucu SİPARİŞİN VERİTABANINDAKİ
// durumuna bakar ("paid" olmadan hiçbir şey vermez). Hesap şifresiz bir öğrenci
// hesabıysa (ödemeyle otomatik oluşan) oturum token'ı da döner; şifreli
// hesaplar giriş yapmalı.
export const claimOnboarding = async (req, res) => {
  try {
    const oid = String(req.body?.merchantOid || "").trim();
    if (!oid || oid.length > 100) return res.status(400).json({ success: false, message: "Geçersiz istek." });

    const order = await prisma.order.findUnique({ where: { merchantOid: oid } });
    if (!order) {
      const meta = await prisma.paymentMeta.findUnique({ where: { merchantOid: oid }, select: { id: true } });
      return res.json({ success: true, status: meta ? "pending" : "unknown" });
    }
    if (order.status === "failed") return res.json({ success: true, status: "failed" });
    if (order.status !== "paid" || !order.userId) return res.json({ success: true, status: "pending" });

    let onboarding = null;
    try {
      onboarding = await ensureOnboardingForOrder(order.id);
    } catch (e) {
      console.warn("claim ensureOnboarding:", e?.message);
    }
    if (!onboarding) return res.json({ success: true, status: "paid", onboarding: false });

    const user = await prisma.user.findUnique({ where: { id: order.userId } });
    const out = { success: true, status: "paid", onboarding: true, userId: user.id };
    if (user.role === "student" && !user.password) {
      out.token = generateToken({ id: user.id, email: user.email, role: user.role });
      out.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, grade: user.grade, track: user.track };
    }
    res.json(out);
  } catch (err) {
    console.error("claimOnboarding:", err);
    res.status(500).json({ success: false, message: "Sipariş doğrulanamadı." });
  }
};

// GET /api/admin/onboardings
export const listOnboardingsForAdmin = async (req, res) => {
  try {
    const rows = await prisma.onboarding.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, assignedCoach: { select: { name: true } } } },
        order: { select: { id: true, createdAt: true, totalPrice: true } },
      },
    });
    res.json({ success: true, onboardings: rows });
  } catch (err) {
    console.error("listOnboardingsForAdmin:", err);
    res.status(500).json({ success: false, message: "Liste alınamadı." });
  }
};
