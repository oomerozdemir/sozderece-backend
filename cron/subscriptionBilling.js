import cron from "node-cron";
import prisma from "../utils/prisma.js";
import { cleanMerchantOid } from "../utils/helpers.js";
import { v4 as uuidv4 } from "uuid";
import { chargeRecurring } from "../utils/paytrRecurring.js";
import { resolveChargeSuccess, resolveChargeFailure } from "../controllers/subscription.controller.js";
import { sendSubscriptionCancelledEmail } from "../utils/sendEmail.js";

const TZ = "Europe/Istanbul";

/**
 * PayTR'nin Kayıtlı Karttan Tekrarlayan Ödeme servisine gerçek çağrı
 * (non_3d=1 + recurring_payment=1 + sync_mode=1, kullanıcı hiçbir şey görmez).
 *
 * PayTR'ye istek atmadan ÖNCE durable bir "pending" SubscriptionCharge kaydı
 * oluşturulur. sync_mode=1 sayesinde yanıt genelde anlık "success"/"failed"
 * gelir, ama "wait_callback" da dönebilir (henüz kesinleşmedi) — bu durumda
 * asıl sonuç PayTR'nin asenkron Bildirim URL callback'i ile gelecek
 * (order.controller.js#handlePaytrCallback, merchant_oid üzerinden bu pending
 * kaydı bulup kesinleştiriyor). Bu ikili yapı, "wait_callback"i sahte bir
 * başarısızlık sayıp ikinci kez çekim denemenin (çifte çekim) önüne geçiyor.
 *
 * ⚠️ Non3D/sync_mode yetkisi mağazada PayTR tarafından açılana kadar bu servis
 * PayTR'den "yetkisiz" hatası döner — kod hazır, aktivasyon PayTR'nin onayını
 * bekliyor.
 *
 * @returns {Promise<{status: "success"|"failed"|"wait_callback", reason?: string, merchantOid: string}>}
 */
async function chargeSubscription(subscription) {
  const merchantOid = cleanMerchantOid(uuidv4());
  const attemptNumber = subscription.failedAttempts + 1;

  const [user, latestOrder] = await Promise.all([
    prisma.user.findUnique({ where: { id: subscription.userId } }),
    prisma.order.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: "desc" },
      include: { billingInfo: true },
    }),
  ]);

  const billingInfo = latestOrder?.billingInfo;
  if (!user?.email || !billingInfo) {
    return { status: "failed", reason: "MISSING_USER_OR_BILLING_INFO", merchantOid };
  }

  const amountTL = (subscription.amount / 100).toFixed(2);

  await prisma.subscriptionCharge.create({
    data: {
      subscriptionId: subscription.id,
      merchantOid,
      amount: subscription.amount,
      status: "pending",
      attemptNumber,
    },
  });

  const result = await chargeRecurring({
    merchantOid,
    email: user.email,
    amountTL,
    utoken: subscription.utoken,
    ctoken: subscription.ctoken,
    userName: `${billingInfo.name} ${billingInfo.surname}`.trim(),
    userAddress: billingInfo.address,
    userPhone: billingInfo.phone,
    cart: [{ name: subscription.planLabel, price: amountTL, quantity: 1 }],
  });

  return { ...result, merchantOid };
}

// Her gün 08:00'de (İstanbul saati)
cron.schedule(
  "0 8 * * *",
  async () => {
    console.log("🔁 Abonelik faturalama kontrolü başladı");
    try {
      const now = new Date();

      // 1) Vadesi gelen aktif/past_due abonelikleri faturalandır
      const dueSubscriptions = await prisma.subscription.findMany({
        where: {
          status: { in: ["active", "past_due"] },
          cancelAtPeriodEnd: false,
          nextBillingDate: { lte: now },
        },
      });

      for (const subscription of dueSubscriptions) {
        try {
          const result = await chargeSubscription(subscription);
          if (result.status === "success") {
            await resolveChargeSuccess({ subscriptionId: subscription.id, merchantOid: result.merchantOid });
          } else if (result.status === "wait_callback") {
            console.log(`⏳ Abonelik #${subscription.id}: PayTR yanıtı henüz kesinleşmedi (wait_callback), asenkron callback bekleniyor (merchant_oid=${result.merchantOid}).`);
          } else {
            await resolveChargeFailure({ subscriptionId: subscription.id, merchantOid: result.merchantOid, reason: result.reason });
          }
        } catch (err) {
          console.error(`❌ Abonelik #${subscription.id} işlenirken hata:`, err?.message);
        }
      }

      // 2) Dönem sonuna gelmiş, iptal bekleyen abonelikleri kapat
      const endingSubscriptions = await prisma.subscription.findMany({
        where: {
          status: { in: ["active", "past_due"] },
          cancelAtPeriodEnd: true,
          currentPeriodEnd: { lte: now },
        },
        include: { user: true },
      });

      for (const subscription of endingSubscriptions) {
        try {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "cancelled", cancelledAt: new Date() },
          });
          if (subscription.user?.email) {
            await sendSubscriptionCancelledEmail(subscription.user.email, subscription);
          }
          console.log(`✅ Abonelik #${subscription.id} dönem sonunda kapatıldı.`);
        } catch (err) {
          console.error(`❌ Abonelik #${subscription.id} kapatılırken hata:`, err?.message);
        }
      }
    } catch (err) {
      console.error("❌ Abonelik faturalama cron hatası:", err);
    }
  },
  { timezone: TZ }
);
