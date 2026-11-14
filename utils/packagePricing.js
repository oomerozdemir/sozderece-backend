import prisma from "./prisma.js";
import { toDayStart } from "./istanbulTime.js";

// "Kasım İndirimi" (ve benzeri gelecekteki) plan-seviyesi kampanyalar için
// tek source-of-truth — hem gerçek tahsilat (computeUnitPriceForPackage),
// hem sahtekarlık kontrolü (getAllValidUnitPrices), hem public paket
// listesinin "campaignActive" alanı AYNI bu fonksiyonu çağırır. "Sınava
// Kadar" planındaki dynamicExamPrice gibi, plans[] zaten serbest bir JSON
// dizisi olduğu için bu alanlar migration GEREKTİRMİYOR.
//
// Savunmacı/fail-safe: campaignLabel'a hiç bakmaz (sadece sunum alanı,
// aktiflik kararını etkilemez) ve geçersiz/tutarsız bir config'te (NaN
// tarih, start>=end, kampanya fiyatı normal fiyattan düşük değilse)
// sessizce false döner — yani normal fiyata düşer. Bu, validatePlanCampaignFields
// ile YAZMA anında zaten reddedilen durumların, OKUMA anında da asla kötü
// bir fiyat üretmemesini garanti eden ikinci bir güvenlik katmanı.
export function isPlanCampaignActive(plan) {
  if (!plan?.campaignUnitPrice || !plan?.campaignStartsAt || !plan?.campaignEndsAt) return false;
  const campaignPrice = Number(plan.campaignUnitPrice);
  if (!Number.isFinite(campaignPrice) || campaignPrice <= 0) return false;
  if (plan.unitPrice != null && campaignPrice >= Number(plan.unitPrice)) return false;
  const starts = new Date(plan.campaignStartsAt);
  const ends = new Date(plan.campaignEndsAt);
  if (isNaN(starts.getTime()) || isNaN(ends.getTime()) || starts >= ends) return false;
  const now = new Date();
  return now >= starts && now <= ends;
}

// isPlanCampaignActive'in YAZMA tarafındaki eşleniği — admin bir plana
// kampanya alanlarından BİRİNİ bile girdiyse hepsi tutarlı olmalı, aksi
// halde çağıran yer (package.controller.js) bunu 400 ile reddeder; hatalı
// config sessizce kaydedilmez.
export function validatePlanCampaignFields(plan) {
  const hasAny = plan?.campaignUnitPrice != null || plan?.campaignStartsAt != null || plan?.campaignEndsAt != null;
  if (!hasAny) return null;
  const price = Number(plan.campaignUnitPrice);
  if (!Number.isInteger(price) || price <= 0) return `"${plan.label || "Plan"}": campaignUnitPrice pozitif bir tam sayı (kuruş) olmalı.`;
  if (plan.unitPrice != null && price >= Number(plan.unitPrice)) return `"${plan.label || "Plan"}": campaignUnitPrice normal unitPrice'tan küçük olmalı.`;
  const starts = new Date(plan.campaignStartsAt);
  const ends = new Date(plan.campaignEndsAt);
  if (isNaN(starts.getTime())) return `"${plan.label || "Plan"}": campaignStartsAt geçersiz tarih.`;
  if (isNaN(ends.getTime())) return `"${plan.label || "Plan"}": campaignEndsAt geçersiz tarih.`;
  if (starts >= ends) return `"${plan.label || "Plan"}": campaignStartsAt, campaignEndsAt'ten önce olmalı.`;
  return null;
}

// Bir paket + (opsiyonel) plan index için DB'deki güncel doğru birim fiyatını
// (kuruş) hesaplar. Öncelik: plan (kampanyalıysa kampanya > normal) > sınav
// > statik promo > normal. cart.controller.js#addToCart'ta da aynı mantık
// kullanılıyordu — tek kaynaktan yönetilsin diye buraya taşındı.
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
  if (selectedPlan) {
    if (isPlanCampaignActive(selectedPlan)) return selectedPlan.campaignUnitPrice;
    if (selectedPlan.unitPrice) return selectedPlan.unitPrice;
  }
  if (dbPkg.examDate && new Date(dbPkg.examDate) > new Date()) {
    // ÖNEMLİ: "today" sunucunun kendi saat dilimine (Render varsayılan UTC)
    // göre değil, İstanbul takvim gününe göre sıfırlanmalı — aksi halde
    // examDate tam UTC gece yarısında saklandığı için backend'in daysLeft'i
    // frontend'in (müşterinin İstanbul/UTC+3 tarayıcısı, promoUtils.js#
    // getExamDaysLeft) hesapladığından HER GÜN tam 1 gün az çıkıyor — gece
    // yarısına yakın bir pencereyle sınırlı değil, sabit bir kayma (bkz.
    // istanbulTime.js'in aynı sınıf hata için yazılmış açıklaması). Bu da
    // sınava-kadar fiyatını her zaman birkaç TL farklı hesaplatıp
    // prepareOrder'ın ±1 kuruş toleransını her seferinde aşıyordu.
    const today = toDayStart(new Date());
    const daysLeft = Math.ceil((new Date(dbPkg.examDate) - today) / (1000 * 60 * 60 * 24));
    const rate = dbPkg.examDiscountRate ?? 5;
    const totalTL = (daysLeft / 30) * dbPkg.price;
    const discountedTL = totalTL * (1 - rate / 100);
    // ÖNEMLİ: frontend (promoUtils.js#getExamPrice) ekranda gösterdiği VE
    // müşteriden tahsil ettiği tutarı önce TAM LİRA'ya yuvarlıyor, sonra
    // kuruşa çeviriyor — burada ham kuruşu doğrudan yuvarlarsak (floating-point
    // TL'yi *100 sonrası tek adımda) iki taraf farklı kuruş değerleri üretir.
    // prepareOrder bu değeri ±1 kuruş toleransla karşılaştırdığı için o fark
    // (günlere göre genelde birkaç TL) her sınav-indirimli siparişi meşru
    // olduğu halde "Fiyat bilgisi doğrulanamadı" ile reddediyordu. Aynı
    // yuvarlama sırası (önce tam TL, sonra kuruş) burada da uygulanıyor.
    return Math.round(discountedTL) * 100;
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
//
// ÖNEMLİ: bir planın kampanyası aktifken SADECE kampanya fiyatı valid
// sayılır — normal unitPrice aynı anda valid KALMAZ (kampanya süresince
// müşteri yanlışlıkla/kasıtlı olarak eski tam fiyatı ödeyemesin). Kampanya
// alanı olmayan planlar (ör. dynamicExamPrice) isPlanCampaignActive'den
// zaten false aldığı için davranışları değişmez.
export function getAllValidUnitPrices(dbPkg) {
  const prices = new Set();
  const pkgPlans = Array.isArray(dbPkg.plans) ? dbPkg.plans : [];

  // dbPkg.unitPrice bazı paketlerde (ör. yks-kocluk-paketi) kampanyalı
  // plan'ın normal fiyatıyla SAYISAL OLARAK aynı — kampanya aktifken bu
  // paket-seviyesi alan üzerinden dışlama kuralını delmesin diye, o değeri
  // taşıyan bir plan o an kampanyadaysa buradan da çıkarılır.
  const suppressedNormalPrices = new Set(
    pkgPlans.filter(isPlanCampaignActive).map((p) => p.unitPrice).filter((v) => v != null)
  );
  if (dbPkg.unitPrice != null && !suppressedNormalPrices.has(dbPkg.unitPrice)) {
    prices.add(dbPkg.unitPrice);
  }

  for (const plan of pkgPlans) {
    if (isPlanCampaignActive(plan)) {
      prices.add(plan.campaignUnitPrice);
    } else if (plan?.unitPrice) {
      prices.add(plan.unitPrice);
    }
  }
  // computeUnitPriceForPackage(dbPkg, null) planIndex vermediği için kendi
  // son çare dalında da dbPkg.unitPrice'a düşebiliyor — aynı dışlama listesi
  // burada da uygulanır, aksi halde kampanya bu ikinci yoldan delinir.
  const dynamicPrice = computeUnitPriceForPackage(dbPkg, null);
  if (dynamicPrice != null && !suppressedNormalPrices.has(dynamicPrice)) {
    prices.add(dynamicPrice);
  }
  return Array.from(prices);
}
