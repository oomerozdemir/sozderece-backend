import prisma from "./prisma.js";
import { questionIndex } from "./onboardingForm.js";

// Bu tarihten ÖNCE oluşmuş siparişler onboarding'e alınmaz (mevcut öğrenciler
// birden "tanışma formu doldur" diye karşılanmasın).
export const ONBOARDING_LAUNCH = new Date("2026-09-23T17:45:00Z");

export const STAGES = [
  "payment_completed",
  "introduction_form_started",
  "introduction_form_completed",
  "process_intro_completed",
  "coach_assigned",
  "first_program_created",
  "onboarding_completed",
];

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

// Cevaplar, admin panelinden düzenlenebilen form tanımına (getOnboardingForm)
// göre doğrulanır: sadece tanımlı anahtarlar, tek/çoklu seçimde sadece tanımlı
// seçenekler, metinde uzunluk sınırı. Bilinmeyen her şey atılır.
export function sanitizeAnswers(input = {}, form) {
  const a = input || {};
  const out = {};
  for (const q of questionIndex(form).values()) {
    const v = a[q.key];
    if (q.type === "single") {
      if (typeof v === "string" && q.options.has(v)) out[q.key] = v;
    } else if (q.type === "multi") {
      if (Array.isArray(v)) {
        const picked = [...q.options].filter((o) => v.includes(o));
        if (picked.length) out[q.key] = picked;
      }
      const other = str(a[`${q.key}Other`], 300);
      if (other) out[`${q.key}Other`] = other;
    } else {
      const t = str(v, q.type === "textarea" ? 1500 : q.type === "tel" ? 30 : 200);
      if (t) out[q.key] = t;
    }
  }
  return out;
}

// Bir sipariş için onboarding kaydı oluşturur (yoksa). Sadece: ödenmiş sipariş,
// lansman sonrası, kilitli fiyatlı (devam) olmayan bir paket ve kullanıcının
// ilk ödenmiş siparişi. Uygun değilse null. Hata fırlatabilir — çağıran yakalar.
export async function ensureOnboardingForOrder(orderId) {
  const existing = await prisma.onboarding.findUnique({ where: { orderId } });
  if (existing) return existing;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "paid" || !order.userId) return null;
  if (order.createdAt < ONBOARDING_LAUNCH) return null;

  const meta = order.merchantOid
    ? await prisma.paymentMeta.findUnique({ where: { merchantOid: order.merchantOid } })
    : null;
  const slug = meta?.packageSlug || meta?.cart?.[0]?.slug || null;
  const pkg = slug ? await prisma.package.findUnique({ where: { slug } }) : null;
  if (!pkg || pkg.requiresPriceLock) return null;

  const earlier = await prisma.order.count({
    where: { userId: order.userId, id: { not: order.id }, status: { in: ["paid", "refund_requested", "refunded"] } },
  });
  if (earlier > 0) return null;

  return prisma.onboarding.create({
    data: {
      userId: order.userId,
      orderId: order.id,
      packageSlug: pkg.slug,
      packageName: pkg.name,
      stage: "payment_completed",
      stageTimes: { payment_completed: new Date().toISOString() },
    },
  });
}

// Kullanıcının (henüz onboarding'i açılmamış) en yeni uygun siparişi için de dener.
export async function ensureOnboardingForUser(userId) {
  const mine = await prisma.onboarding.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (mine) return mine;
  const order = await prisma.order.findFirst({
    where: { userId, status: "paid", createdAt: { gte: ONBOARDING_LAUNCH } },
    orderBy: { createdAt: "asc" },
  });
  return order ? ensureOnboardingForOrder(order.id) : null;
}

export const isFormDone = (o) => STAGES.indexOf(o.stage) >= STAGES.indexOf("introduction_form_completed");

// Mevcut cevaplara gelen kısmi cevapları uygular. İstemci bir alanı boş ("" ya da
// []) gönderirse o cevap silinir (ör. sınav YKS'den LGS'ye değişince eski sınıf).
export function mergeAnswers(existing = {}, input = {}, form) {
  const patch = sanitizeAnswers(input, form);
  const merged = { ...existing, ...patch };
  for (const key of Object.keys(input || {})) {
    if (!(key in patch) && key in merged) {
      const v = input[key];
      if (v === "" || v === null || (Array.isArray(v) && v.length === 0)) delete merged[key];
    }
  }
  return merged;
}
