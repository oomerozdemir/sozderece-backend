import prisma from "./prisma.js";

// AI Soru Asistanı — paket bazlı erişim. ROLE DEĞİL, ENTITLEMENT bazlı: bu
// öğrencinin şu an aktif, "paid" + süresi dolmamış bir siparişi var mı ve o
// siparişin gerçek paketi (Order.package SERBEST METİN, asla okunmaz —
// PaymentMeta.packageSlug, checkout anında yakalanan gerçek Package.slug)
// Package.aiQuestionAssistantAccess=true mu?
//
// Paket adı/fiyatı burada ASLA hardcode edilmez — yalnızca admin'in
// AdminPackagePage'ten işaretlediği bayrak okunur.
export async function hasAiQuestionAssistantAccess(userId) {
  const now = new Date();

  const activeOrders = await prisma.order.findMany({
    where: { userId, status: "paid", endDate: { gte: now } },
    select: { merchantOid: true },
  });

  for (const order of activeOrders) {
    if (!order.merchantOid) continue;
    const pm = await prisma.paymentMeta.findUnique({
      where: { merchantOid: order.merchantOid },
      select: { packageSlug: true },
    });
    if (!pm?.packageSlug) continue;
    const pkg = await prisma.package.findUnique({
      where: { slug: pm.packageSlug },
      select: { aiQuestionAssistantAccess: true },
    });
    if (pkg?.aiQuestionAssistantAccess) {
      return { allowed: true, reason: null, packageSlug: pm.packageSlug };
    }
  }

  // Bugün üretimde hiç aylık abonelik yok (tüm Package.billingCycle="once")
  // — bu blok ileri-uyumluluk için var, fiilen no-op.
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { userId, status: "active", currentPeriodEnd: { gte: now } },
    select: { packageSlug: true },
  });

  for (const sub of activeSubscriptions) {
    if (!sub.packageSlug) continue;
    const pkg = await prisma.package.findUnique({
      where: { slug: sub.packageSlug },
      select: { aiQuestionAssistantAccess: true },
    });
    if (pkg?.aiQuestionAssistantAccess) {
      return { allowed: true, reason: null, packageSlug: sub.packageSlug };
    }
  }

  return { allowed: false, reason: "PACKAGE_REQUIRED", packageSlug: null };
}

// Güvenli rollout anahtarı — bkz. plan K13. "true" olmadığı sürece middleware
// gerçek sonucu hesaplayıp loglar ama kimseyi engellemez (sessiz/shadow mod).
// Admin gerçek paketleri işaretleyip doğruladıktan SONRA bu env true yapılır.
export const AI_ASSISTANT_GATE_ENABLED = process.env.AI_ASSISTANT_GATE_ENABLED === "true";

export async function requireAiQuestionAssistantAccess(req, res, next) {
  let result;
  try {
    result = await hasAiQuestionAssistantAccess(req.user.id);
  } catch (err) {
    console.error("requireAiQuestionAssistantAccess check failed:", err);
    // Fail-closed prensibi yalnızca gate fiilen aktifken uygulanır (aşağıda);
    // shadow modda bir DB hatası gerçek trafiği asla etkilemez.
    result = { allowed: false, reason: "CHECK_FAILED", packageSlug: null };
  }

  if (!AI_ASSISTANT_GATE_ENABLED) {
    if (!result.allowed) {
      console.log(`[ai-gate:shadow] studentId=${req.user.id} would be blocked (${result.reason})`);
    }
    return next();
  }

  if (!result.allowed) {
    return res.status(403).json({
      success: false,
      code: "AI_ASSISTANT_PACKAGE_REQUIRED",
      message: "AI Soru Asistanı mevcut paketine dahil değil.",
    });
  }

  next();
}
