import prisma from "../utils/prisma.js";
import { v4 as uuidv4 } from "uuid";
import { cleanMerchantOid, getUserIp } from "../utils/helpers.js";
import { buildCardRegistrationFields } from "../utils/paytrRecurring.js";
import {
  sendSubscriptionStartedEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentSuccessEmail,
  sendSubscriptionPaymentFailedEmail,
} from "../utils/sendEmail.js";

// Başarısız denemeler arası bekleme (gün) — plan: "1./3./5. gün" demek,
// yani ilk denemeden 2 gün sonra tekrar, ondan 2 gün sonra son deneme.
const RETRY_INTERVAL_DAYS = 2;
const MAX_ATTEMPTS = 3;

// Frontend'deki onay kutusuyla BİREBİR aynı metin olmalı — chargeback/itiraz
// savunmasında "kullanıcı tam olarak neyi onayladı" sorusunun kanıtı budur.
export const SUBSCRIPTION_CONSENT_TEXT =
  "Bu paketin her ay otomatik olarak yenileneceğini, kayıtlı kartımdan tekrar çekim yapılacağını ve dilediğim zaman \"Siparişlerim\" sayfasından iptal edebileceğimi anladım ve onaylıyorum.";

/**
 * Abonelik başlatma — 1. adım: PayTR "Yeni Kart Ekleme + İlk Ödeme" formu
 * için gereken alanları (hash dahil) hazırlar. Kart bilgileri (numara/cvv/son
 * kullanma) bu isteğe hiç dahil değil — onlar tarayıcıda, kullanıcının
 * dolduracağı ve DOĞRUDAN PayTR'ye giden gerçek bir <form>'da toplanacak.
 * Gerçek Subscription kaydı, PayTR'nin asenkron callback'i (aşağıda
 * handleCardRegistrationCallback) geldiğinde oluşturulur.
 */
export const startSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { slug, planIndex, billingInfo, consentAccepted } = req.body;

    if (!slug || !billingInfo) {
      return res.status(400).json({ error: "Eksik veri: slug ve billingInfo zorunludur." });
    }
    if (consentAccepted !== true) {
      return res.status(400).json({ error: "Otomatik yenileme onayı olmadan abonelik başlatılamaz." });
    }

    const pkg = await prisma.package.findUnique({ where: { slug } });
    if (!pkg) return res.status(404).json({ error: "Paket bulunamadı." });

    // Paketin sekmeli süre planları (plans[]) varsa ve geçerli bir planIndex
    // gönderilmişse o planın billingCycle'ı kullanılır; aksi halde (sekmesiz,
    // tek fiyatlı paket) paketin kendi billingCycle/unitPrice alanları
    // "sanal bir plan" gibi kullanılır — admin panelde "normal paket ekleme"
    // formundaki Ödeme Tipi seçimi buraya karşılık geliyor.
    const plans = Array.isArray(pkg.plans) ? pkg.plans : [];
    const hasPlanIndex = planIndex !== undefined && planIndex !== null && plans[parseInt(planIndex)];
    const plan = hasPlanIndex
      ? plans[parseInt(planIndex)]
      : { label: pkg.name, unitPrice: pkg.unitPrice, billingCycle: pkg.billingCycle };

    if (plan.billingCycle !== "monthly") {
      return res.status(400).json({ error: "Seçilen plan bir abonelik planı değil." });
    }
    if (!plan.unitPrice) {
      return res.status(400).json({ error: "Plan fiyatı tanımsız." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const email = user?.email;
    if (!email) return res.status(400).json({ error: "Kullanıcı e-postası bulunamadı." });

    const merchantOid = cleanMerchantOid(uuidv4());
    const amountTL = (plan.unitPrice / 100).toFixed(2);
    const packageName = hasPlanIndex ? `${pkg.name} (${plan.label})` : pkg.name;
    const cart = [{ name: packageName, price: amountTL, quantity: 1 }];
    const consentIp = getUserIp(req);
    const consentAt = new Date().toISOString();

    // Callback gelene kadar bekleyen kayıt — mevcut PaymentMeta tablosu
    // yeniden kullanılıyor, cart JSON'u içine abonelik işareti + rıza kanıt
    // izi (IP, zaman damgası, onaylanan tam metin) konuyor. Callback geldiğinde
    // bunlar gerçek Subscription kaydına taşınacak.
    await prisma.paymentMeta.create({
      data: {
        merchantOid,
        userId,
        cart: [{
          ...cart[0],
          isSubscriptionStart: true,
          packageSlug: slug,
          planIndex: hasPlanIndex ? parseInt(planIndex) : null,
          planLabel: plan.label,
          amount: plan.unitPrice,
          consentIp,
          consentAt,
          consentText: SUBSCRIPTION_CONSENT_TEXT,
        }],
        billingInfo,
        packageName,
        packageSlug: slug,
        discountRate: 0,
        totalPrice: parseFloat(amountTL),
      },
    });

    const fields = buildCardRegistrationFields({
      merchantOid,
      userIp: getUserIp(req),
      email,
      amountTL,
      userName: `${billingInfo.name} ${billingInfo.surname}`.trim(),
      userAddress: billingInfo.address,
      userPhone: billingInfo.phone,
      cart,
      okUrl: process.env.PAYTR_SUBSCRIPTION_OK_URL || process.env.PAYTR_OK_URL || "https://sozderecekocluk.com/order-success",
      failUrl: process.env.PAYTR_SUBSCRIPTION_FAIL_URL || process.env.PAYTR_FAIL_URL || "https://sozderecekocluk.com/payment-fail",
    });

    return res.json({ fields, paytrEndpoint: "https://www.paytr.com/odeme" });
  } catch (error) {
    console.error("startSubscription hatası:", error);
    return res.status(500).json({ error: "Abonelik başlatılamadı." });
  }
};

/**
 * Abonelik kart-kaydı + ilk-ödeme sonucunu işler.
 *
 * ⚠️ MİMARİ NOT: PayTR'nin asenkron "Bildirim URL"si merchant panelinde
 * TEK ve SABİT bir adres olarak tanımlanıyor (klasik tek-seferlik akışta da
 * aynı — initiatePaytrPayment hiçbir yerde ayrı bir notification_url
 * parametresi göndermiyor). Yani bu abonelik akışı için PayTR AYRI bir
 * callback URL'ine POST ATMAYACAK; her şey mevcut tek callback'e
 * (order.controller.js#handlePaytrCallback, PayTR panelinde kayıtlı olan
 * adres) gelecek. Bu yüzden bu fonksiyon bir Express route handler DEĞİL —
 * handlePaytrCallback tarafından, PaymentMeta'daki isSubscriptionStart
 * işareti görüldüğünde çağrılan sıradan bir yardımcı fonksiyon.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function finalizeSubscriptionStart({ pm, merchantOid, status, utoken, ctoken }) {
  try {
    if (status !== "success") {
      console.log(`⚠️ Abonelik başlatma başarısız (merchant_oid=${merchantOid}):`, status);
      return { ok: false, reason: "PAYMENT_NOT_SUCCESS" };
    }

    if (!utoken || !ctoken) {
      // Normalde PayTR bunları callback'te her zaman döndürür (bkz.
      // paytrRecurring.js başındaki not, dev.paytr.com ile teyitli). Buraya
      // düşülmesi PayTR tarafında beklenmedik bir durum demek — kart token'ı
      // olmadan gelecekteki tekrarlayan çekim imkansız, acil müdahale gerekir.
      console.error(`🚨 Abonelik callback'inde utoken/ctoken eksik (merchant_oid=${merchantOid}) — PayTR yanıtını kontrol edin.`);
      return { ok: false, reason: "MISSING_TOKEN" };
    }

    const meta = Array.isArray(pm.cart) ? pm.cart[0] : null;
    const amount = meta?.amount || Math.round(Number(pm.totalPrice) * 100);
    const planLabel = pm.packageName;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const billingInfo = await prisma.billingInfo.create({ data: pm.billingInfo });

    const subscription = await prisma.subscription.create({
      data: {
        userId: pm.userId,
        packageSlug: pm.packageSlug || meta?.packageSlug || "",
        planLabel,
        amount,
        status: "active",
        utoken,
        ctoken,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        consentIp: meta?.consentIp || null,
        consentAt: meta?.consentAt ? new Date(meta.consentAt) : null,
        consentText: meta?.consentText || null,
      },
    });

    const order = await prisma.order.create({
      data: {
        package: planLabel,
        userId: pm.userId,
        billingInfoId: billingInfo.id,
        startDate: new Date(),
        endDate: periodEnd,
        status: "paid",
        merchantOid,
        totalPrice: amount / 100,
        subscriptionId: subscription.id,
        orderItems: { create: [{ name: planLabel, price: amount / 100, quantity: 1 }] },
      },
    });

    const user = await prisma.user.findUnique({ where: { id: pm.userId } });
    if (user?.email) {
      try {
        await sendSubscriptionStartedEmail(user.email, subscription);
      } catch (e) {
        console.warn("Abonelik başlangıç maili gönderilemedi:", e?.message);
      }
    }

    console.log(`✅ Abonelik #${subscription.id} başlatıldı (order #${order.id}, merchant_oid=${merchantOid})`);
    return { ok: true };
  } catch (error) {
    console.error("❌ Abonelik başlatma finalize hatası:", error);
    return { ok: false, reason: "SERVER_ERROR" };
  }
}

/**
 * Aylık tekrarlayan çekimin BAŞARILI sonucunu kesinleştirir — hem
 * cron/subscriptionBilling.js'nin sync_mode="success" yanıtından hem de
 * bu callback'in kendisinden (wait_callback sonrası asenkron onay)
 * çağrılabilir; bu yüzden idempotent: pending olmayan bir charge'ı
 * (zaten sonuçlanmış) sessizce no-op geçer — çifte Order/mail riski yok.
 */
export async function resolveChargeSuccess({ subscriptionId, merchantOid }) {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      console.error(`❌ resolveChargeSuccess: subscription #${subscriptionId} bulunamadı (merchant_oid=${merchantOid})`);
      return { ok: false, reason: "SUBSCRIPTION_NOT_FOUND" };
    }

    const charge = await prisma.subscriptionCharge.findUnique({ where: { merchantOid } });
    if (charge && charge.status !== "pending") {
      console.log(`ℹ️ resolveChargeSuccess: charge zaten sonuçlanmış (merchant_oid=${merchantOid}, status=${charge.status}), tekrar işlenmiyor.`);
      return { ok: true, alreadyResolved: true };
    }

    const latestOrder = await prisma.order.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: "desc" },
      include: { billingInfo: true },
    });
    const billingInfo = latestOrder?.billingInfo;
    if (!billingInfo) {
      console.error(`❌ subscription #${subscription.id} için billingInfo bulunamadı, sipariş oluşturulamadı (merchant_oid=${merchantOid}).`);
      return { ok: false, reason: "MISSING_BILLING_INFO" };
    }

    const nextPeriodEnd = new Date(subscription.currentPeriodEnd);
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    const order = await prisma.order.create({
      data: {
        package: subscription.planLabel,
        userId: subscription.userId,
        billingInfoId: billingInfo.id,
        startDate: subscription.currentPeriodEnd,
        endDate: nextPeriodEnd,
        status: "paid",
        merchantOid,
        totalPrice: subscription.amount / 100,
        subscriptionId: subscription.id,
        orderItems: { create: [{ name: subscription.planLabel, price: subscription.amount / 100, quantity: 1 }] },
      },
      include: { billingInfo: true },
    });

    if (charge) {
      await prisma.subscriptionCharge.update({ where: { merchantOid }, data: { status: "success" } });
    } else {
      await prisma.subscriptionCharge.create({
        data: {
          subscriptionId: subscription.id,
          merchantOid,
          amount: subscription.amount,
          status: "success",
          attemptNumber: subscription.failedAttempts + 1,
        },
      });
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        currentPeriodEnd: nextPeriodEnd,
        nextBillingDate: nextPeriodEnd,
        failedAttempts: 0,
        lastFailureReason: null,
      },
    });

    const to = billingInfo.email;
    if (to) {
      try {
        await sendPaymentSuccessEmail(to, {
          id: order.id,
          package: order.package,
          startDate: order.startDate,
          endDate: order.endDate,
          totalPrice: order.totalPrice,
          discountRate: 0,
          billingInfo: order.billingInfo,
        });
      } catch (e) {
        console.warn(`Abonelik ödeme başarı maili gönderilemedi (sub #${subscription.id}):`, e?.message);
      }
    }

    console.log(`✅ Abonelik #${subscription.id} için aylık çekim başarılı (merchant_oid=${merchantOid}), sonraki tarih: ${nextPeriodEnd.toISOString()}`);
    return { ok: true };
  } catch (error) {
    console.error("❌ resolveChargeSuccess hatası:", error);
    return { ok: false, reason: "SERVER_ERROR" };
  }
}

/**
 * Aylık tekrarlayan çekimin BAŞARISIZ sonucunu kesinleştirir — aynı
 * idempotans kuralı resolveChargeSuccess ile aynı: pending olmayan bir
 * charge'ı tekrar işlemez.
 */
export async function resolveChargeFailure({ subscriptionId, merchantOid, reason }) {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      console.error(`❌ resolveChargeFailure: subscription #${subscriptionId} bulunamadı (merchant_oid=${merchantOid})`);
      return { ok: false, reason: "SUBSCRIPTION_NOT_FOUND" };
    }

    const charge = await prisma.subscriptionCharge.findUnique({ where: { merchantOid } });
    if (charge && charge.status !== "pending") {
      console.log(`ℹ️ resolveChargeFailure: charge zaten sonuçlanmış (merchant_oid=${merchantOid}, status=${charge.status}), tekrar işlenmiyor.`);
      return { ok: true, alreadyResolved: true };
    }

    const attemptNumber = charge ? charge.attemptNumber : subscription.failedAttempts + 1;

    if (charge) {
      await prisma.subscriptionCharge.update({
        where: { merchantOid },
        data: { status: "failed", failReason: reason || "UNKNOWN" },
      });
    } else {
      await prisma.subscriptionCharge.create({
        data: {
          subscriptionId: subscription.id,
          merchantOid,
          amount: subscription.amount,
          status: "failed",
          failReason: reason || "UNKNOWN",
          attemptNumber,
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: subscription.userId } });
    const to = user?.email;

    if (attemptNumber >= MAX_ATTEMPTS) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          failedAttempts: attemptNumber,
          lastFailureReason: reason || "UNKNOWN",
        },
      });
      if (to) {
        try {
          await sendSubscriptionPaymentFailedEmail(to, { subscription, attemptNumber, nextRetryDate: null });
          await sendSubscriptionCancelledEmail(to, subscription);
        } catch (e) {
          console.warn(`Abonelik iptal maili gönderilemedi (sub #${subscription.id}):`, e?.message);
        }
      }
      console.log(`⛔ Abonelik #${subscription.id}: ${MAX_ATTEMPTS} deneme tükendi, iptal edildi (merchant_oid=${merchantOid}).`);
    } else {
      const nextRetryDate = new Date(Date.now() + RETRY_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "past_due",
          nextBillingDate: nextRetryDate,
          failedAttempts: attemptNumber,
          lastFailureReason: reason || "UNKNOWN",
        },
      });
      if (to) {
        try {
          await sendSubscriptionPaymentFailedEmail(to, { subscription, attemptNumber, nextRetryDate });
        } catch (e) {
          console.warn(`Abonelik başarısız-ödeme maili gönderilemedi (sub #${subscription.id}):`, e?.message);
        }
      }
      console.log(`⚠️ Abonelik #${subscription.id}: ${attemptNumber}. deneme başarısız (merchant_oid=${merchantOid}), sonraki deneme ${nextRetryDate.toISOString()}`);
    }

    return { ok: true };
  } catch (error) {
    console.error("❌ resolveChargeFailure hatası:", error);
    return { ok: false, reason: "SERVER_ERROR" };
  }
}

/** Giriş yapmış kullanıcının aboneliklerini listeler. */
export const getMySubscriptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        charges: { orderBy: { attemptedAt: "desc" }, take: 5 },
      },
    });
    res.status(200).json({ subscriptions });
  } catch (error) {
    console.error("Abonelikler alınamadı:", error?.message);
    res.status(500).json({ message: "Abonelikler alınamadı." });
  }
};

/** Kullanıcı kendi aboneliğini iptal eder — dönem sonunda durur, hemen değil. */
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const subscriptionId = parseInt(req.params.id);

    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!subscription) {
      return res.status(404).json({ message: "Abonelik bulunamadı." });
    }
    if (subscription.status === "cancelled") {
      return res.status(400).json({ message: "Abonelik zaten iptal edilmiş." });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: true },
    });

    res.status(200).json({ message: "Abonelik, dönem sonunda duracak şekilde iptal edildi.", subscription: updated });
  } catch (error) {
    console.error("Abonelik iptali başarısız:", error?.message);
    res.status(500).json({ message: "Abonelik iptal edilemedi." });
  }
};

/* ============================================================
   Admin
============================================================ */

export const getAllSubscriptionsForAdmin = async (req, res) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        charges: { orderBy: { attemptedAt: "desc" }, take: 3 },
      },
    });
    res.status(200).json({ subscriptions });
  } catch (error) {
    console.error("Admin abonelik listesi alınamadı:", error?.message);
    res.status(500).json({ message: "Abonelikler alınamadı." });
  }
};

/** Admin, bir aboneliği anında (dönem sonunu beklemeden) iptal eder. */
export const adminCancelSubscription = async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!subscription) {
      return res.status(404).json({ message: "Abonelik bulunamadı." });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "cancelled", cancelAtPeriodEnd: false, cancelledAt: new Date() },
    });

    if (subscription.user?.email) {
      try {
        await sendSubscriptionCancelledEmail(subscription.user.email, subscription);
      } catch (e) {
        console.warn("Abonelik iptal maili gönderilemedi:", e?.message);
      }
    }

    res.status(200).json({ message: "Abonelik iptal edildi.", subscription: updated });
  } catch (error) {
    console.error("Admin abonelik iptali başarısız:", error?.message);
    res.status(500).json({ message: "Abonelik iptal edilemedi." });
  }
};
