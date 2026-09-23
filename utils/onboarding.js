import prisma from "./prisma.js";

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

const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const multi = (v, list) => (Array.isArray(v) ? list.filter((x) => v.includes(x)) : undefined);

export const CHALLENGES = [
  "Nereden başlayacağımı bilmiyorum",
  "Program yapıyorum ama sürdüremiyorum",
  "Günümü planlamakta zorlanıyorum",
  "Düzenli çalışamıyorum",
  "Eksiklerimi nasıl kapatacağımı bilmiyorum",
  "Zorlandığım dersleri erteliyorum",
  "Deneme sonuçlarımı nasıl değerlendireceğimi bilmiyorum",
  "Çalışıyorum ama doğru ilerlediğimden emin değilim",
  "Diğer",
];
export const ROUTINES = ["Düzenli çalışıyorum", "Bazen düzenli çalışıyorum", "Oldukça dağınık ilerliyorum", "Henüz bir çalışma düzenim yok"];
export const DAILY_HOURS = ["Henüz düzenli çalışmıyorum", "1 saatten az", "1–2 saat", "2–4 saat", "4 saat+"];
export const SUPPORTS = [
  "Bana uygun çalışma programı",
  "Düzenli takip",
  "Zaman yönetimi",
  "Deneme analizi",
  "Eksiklerimi belirleme",
  "Çalışma düzeni oluşturma",
  "Zorlandığım dersleri yönetme",
  "Süreç boyunca yönlendirilme",
];
export const YKS_GRADES = ["12. sınıf", "Mezun", "Diğer"];
export const LGS_GRADES = ["5. sınıf", "6. sınıf", "7. sınıf", "8. sınıf"];
export const FIELDS = ["Sayısal", "Eşit Ağırlık", "Sözel", "Dil"];

// Sadece bilinen alanlar ve geçerli değerler kabul edilir; gerisi atılır.
export function sanitizeAnswers(input = {}) {
  const a = input || {};
  const out = {
    fullName: str(a.fullName, 120),
    phone: str(a.phone, 30),
    respondent: oneOf(a.respondent, ["ogrenci", "veli"]),
    exam: oneOf(a.exam, ["YKS", "LGS"]),
    grade: oneOf(a.grade, [...YKS_GRADES, ...LGS_GRADES]),
    field: oneOf(a.field, FIELDS),
    targetSchool: str(a.targetSchool, 300),
    targetRank: str(a.targetRank, 100),
    challenges: multi(a.challenges, CHALLENGES),
    challengesOther: str(a.challengesOther, 300),
    routine: oneOf(a.routine, ROUTINES),
    dailyHours: oneOf(a.dailyHours, DAILY_HOURS),
    lastExam: str(a.lastExam, 200),
    supports: multi(a.supports, SUPPORTS),
    note: str(a.note, 1500),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
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
