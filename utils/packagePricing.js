import prisma from "./prisma.js";

// Bir paket + (opsiyonel) plan index için DB'deki güncel doğru birim fiyatını
// (kuruş) hesaplar. Öncelik: plan > sınav > statik promo > normal.
// cart.controller.js#addToCart'ta da aynı mantık kullanılıyordu — tek
// kaynaktan yönetilsin diye buraya taşındı.
export async function getServerUnitPrice(slug, planIndex) {
  const dbPkg = await prisma.package.findUnique({ where: { slug } });
  return dbPkg ? computeUnitPriceForPackage(dbPkg, planIndex) : null;
}

export function computeUnitPriceForPackage(dbPkg, planIndex) {
  const pkgPlans = Array.isArray(dbPkg.plans) ? dbPkg.plans : [];
  const selectedPlan =
    planIndex !== undefined && planIndex !== null && !Number.isNaN(parseInt(planIndex))
      ? pkgPlans[parseInt(planIndex)]
      : null;
  if (selectedPlan && selectedPlan.unitPrice) {
    return selectedPlan.unitPrice;
  }
  if (dbPkg.examDate && new Date(dbPkg.examDate) > new Date()) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((new Date(dbPkg.examDate) - today) / (1000 * 60 * 60 * 24));
    const rate = dbPkg.examDiscountRate ?? 5;
    const totalTL = (daysLeft / 30) * dbPkg.price;
    const discountedTL = totalTL * (1 - rate / 100);
    return Math.round(discountedTL * 100);
  }
  if (dbPkg.promoPrice && dbPkg.promoEndDate && new Date(dbPkg.promoEndDate) > new Date() && dbPkg.promoUnitPrice != null) {
    return dbPkg.promoUnitPrice;
  }
  if (dbPkg.unitPrice != null) {
    return dbPkg.unitPrice;
  }
  return null;
}

// Bir paket için o an geçerli TÜM meşru birim fiyatları (kuruş) döndürür:
// normal fiyat, her plan varyantı, aktifse sınav/promo fiyatı. prepareOrder'da
// client'ın gönderdiği tutarın manipüle edilmediğini doğrulamak için kullanılır.
export function getAllValidUnitPrices(dbPkg) {
  const prices = new Set();
  if (dbPkg.unitPrice != null) prices.add(dbPkg.unitPrice);
  const pkgPlans = Array.isArray(dbPkg.plans) ? dbPkg.plans : [];
  for (const plan of pkgPlans) {
    if (plan?.unitPrice) prices.add(plan.unitPrice);
  }
  const dynamicPrice = computeUnitPriceForPackage(dbPkg, null);
  if (dynamicPrice != null) prices.add(dynamicPrice);
  return Array.from(prices);
}
