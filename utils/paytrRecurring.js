// utils/paytrRecurring.js — PayTR Direkt API / Kart Saklama entegrasyonu.
//
// ÖNEMLİ — 05.09.2026 revizyonu (elle, doğrudan PayTR'ye atılan test
// istekleriyle TEK TEK doğrulandı, spekülasyon değil):
//   - Hash formülü GERÇEKTEN payment_type + installment_count + non_3d
//     içeriyor (eski formül DOĞRU imiş — bir ara "user_basket/no_installment/
//     max_installment içeren" başka bir formüle geçilmişti, o YANLIŞTI ve
//     geri alındı).
//   - no_installment, max_installment, lang alanları PayTR tarafından
//     zorunlu tutuluyor (gerçek hatalarla teyitli) ama hash'e DAHİL DEĞİL —
//     sadece düz POST alanı olarak gönderiliyorlar.
//   - payment_amount ondalıklı TL string'i ("100.00") olduğunda hash
//     GEÇERLİ oluyor ve bir sonraki hataya ilerliyor: "payment_amount
//     degeri integer olmalidir". payment_amount tam sayıya (TL ya da
//     kuruş, ikisi de denendi) çevrildiğinde ise hash HEMEN geçersiz
//     oluyor ("paytr_token gonderilmedi veya gecersiz") — yani hash
//     doğrulaması ondalıklı format bekliyor ama alan doğrulaması tam
//     sayı istiyor; ikisini aynı anda memnun eden bir format
//     bulunamadı. Bu noktada BİLEREK ondalıklı formata geri dönüldü
//     (en azından hash geçiyor, tek ve net bir hata kalıyor) — PayTR
//     destek ekibinden bu çelişkiyi netleştirmesi istenmeli, kör
//     denemeyle çözülecek bir şey değil.

import crypto from "crypto";
import axios from "axios";
import qs from "qs";

const PAYTR_ENDPOINT = "https://www.paytr.com/odeme";

function getCreds() {
  return {
    merchant_id: process.env.PAYTR_MERCHANT_ID?.trim(),
    merchant_key: process.env.PAYTR_MERCHANT_KEY?.trim(),
    merchant_salt: process.env.PAYTR_MERCHANT_SALT?.trim(),
  };
}

// Elle doğrulanan hash formülü — bkz. dosya başındaki not.
function computeDirectApiHash({ merchantId, userIp, merchantOid, email, paymentAmount, paymentType, installmentCount, currency, testMode, non3d, merchantSalt, merchantKey }) {
  const hashStr =
    String(merchantId) +
    String(userIp) +
    String(merchantOid) +
    String(email) +
    String(paymentAmount) +
    String(paymentType) +
    String(installmentCount) +
    String(currency) +
    String(testMode) +
    String(non3d);

  return crypto.createHmac("sha256", merchantKey).update(hashStr + merchantSalt).digest("base64");
}

// Direkt API için: düz JSON string, fiyatlar ondalıklı TL ("50.00") —
// klasik iFrame akışının base64+kuruş formatından FARKLI, PayTR'nin resmi
// örnek kodu (app.js: `JSON.stringify([['Ürün','50.00',1]])`) ile teyitli.
function buildUserBasket(cart) {
  return JSON.stringify(
    (cart || []).map((item) => [item.name, Number(item.price).toFixed(2), item.quantity || 1])
  );
}

/**
 * Tarayıcının doğrudan PayTR'ye (https://www.paytr.com/odeme) POST edeceği
 * "Yeni Kart Ekleme + Ödeme" formu için gereken TÜM alanları hazırlar — kart
 * alanları (cc_owner/card_number/expiry_month/expiry_year/cvv) HARİÇ, onlar
 * kullanıcı tarafından tarayıcıda doğrudan girilip forma eklenecek ve
 * sunucumuza hiç uğramayacak.
 *
 * İki senaryoda kullanılıyor:
 *  - Abonelik başlatma: storeCard="1" (kart, gelecekteki otomatik çekimler
 *    için PayTR'de saklanır, bkz. subscription.controller.js).
 *  - Tek seferlik ödeme: storeCard="0" (kart saklanmaz, sadece o anki tutar
 *    tahsil edilir) — PayTR mağazada Direkt API açıkken klasik iFrame API'yi
 *    kapattığı için tek seferlik akış da bu fonksiyonu kullanıyor, bkz.
 *    order.controller.js#prepareOrder.
 */
export function buildCardRegistrationFields({
  merchantOid,
  userIp,
  email,
  amountTL, // "349.00" gibi, ondalıklı TL string (çağıranlarda değişmedi)
  userName,
  userAddress,
  userPhone,
  cart, // [{name, price, quantity}]
  okUrl,
  failUrl,
  existingUtoken, // varsa, aynı kullanıcının önceki kartına bu yeni kartı da bağlamak için
  storeCard = "1",
}) {
  const { merchant_id, merchant_key, merchant_salt } = getCreds();
  const test_mode = process.env.PAYTR_TEST_MODE || "0";
  const payment_type = "card";
  const installment_count = "0";
  const currency = "TL";
  const non_3d = "0"; // Kart bilgisi girilirken müşteri ekranda — 3D Secure İLE yapılır (dolandırıcılık koruması)
  // "0" = taksit seçenekleri açık — sitede "12 taksite varan" diye reklamı
  // yapılan özellik kapanmasın diye "1" DEĞİL "0" gönderiliyor.
  const no_installment = "0";
  const max_installment = "12";
  // ONDALIKLI TL string'i olarak kalıyor ("349.00") — tam sayıya çevirmek
  // hash'i geçersiz kılıyor (bkz. dosya başındaki not). PayTR'nin ayrıca
  // "integer olmalı" demesiyle çelişiyor, netleştirilmesi lazım.
  const payment_amount = Number(amountTL).toFixed(2);
  const user_basket = buildUserBasket(cart);

  const paytr_token = computeDirectApiHash({
    merchantId: merchant_id,
    userIp,
    merchantOid,
    email,
    paymentAmount: payment_amount,
    paymentType: payment_type,
    installmentCount: installment_count,
    currency,
    testMode: test_mode,
    non3d: non_3d,
    merchantSalt: merchant_salt,
    merchantKey: merchant_key,
  });

  return {
    merchant_id,
    paytr_token,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_type,
    payment_amount,
    installment_count,
    no_installment,
    max_installment,
    lang: "tr",
    client_lang: "tr", // resmi dokümanda "client_lang" adıyla geçiyor; canlıdaki hata mesajı "lang" diyordu — ikisi de gönderiliyor
    currency,
    test_mode,
    non_3d,
    store_card: storeCard,
    ...(existingUtoken ? { utoken: existingUtoken } : {}),
    merchant_ok_url: okUrl,
    merchant_fail_url: failUrl,
    user_name: userName,
    user_address: userAddress,
    user_phone: userPhone,
    user_basket,
  };
}

/**
 * Kayıtlı karttan sunucu-sunucu (arka planda, kullanıcı hiç görmeden)
 * tekrarlayan çekim. `recurring_payment=1` + `non_3d=1` — Non3D yetkisi
 * mağazada açık olmalı (PayTR'nin onayı gerekiyor, bkz. plan dosyası).
 *
 * `sync_mode=1` ile isteğin sonucu anlık JSON olarak dönüyor (PayTR
 * dökümanı — bu da ayrıca Non3D benzeri bir yetki istiyor). Yanıt üç
 * türlü olabilir: "success", "failed", "wait_callback" (henüz kesinleşmedi,
 * asıl sonuç Bildirim URL callback'ine gelecek — bu durumda çağıran taraf
 * kesin bir başarı/başarısızlık kararı VERMEMELİ, callback'i beklemeli).
 *
 * @returns {Promise<{status: "success"|"failed"|"wait_callback", reason?: string, raw?: object}>}
 */
export async function chargeRecurring({ merchantOid, email, amountTL, utoken, ctoken, userName, userAddress, userPhone, cart, userIp = "127.0.0.1" }) {
  const { merchant_id, merchant_key, merchant_salt } = getCreds();
  const test_mode = process.env.PAYTR_TEST_MODE || "0";
  const payment_type = "card";
  const installment_count = "0";
  const currency = "TL";
  const non_3d = "1";
  const no_installment = "1"; // arka planda otomatik çekim — taksit seçimi anlamsız
  const max_installment = "1";
  // bkz. buildCardRegistrationFields — ondalıklı TL kalıyor, tam sayı hash'i bozuyor.
  const payment_amount = Number(amountTL).toFixed(2);
  const user_basket = buildUserBasket(cart);

  const paytr_token = computeDirectApiHash({
    merchantId: merchant_id,
    userIp,
    merchantOid,
    email,
    paymentAmount: payment_amount,
    paymentType: payment_type,
    installmentCount: installment_count,
    currency,
    testMode: test_mode,
    non3d: non_3d,
    merchantSalt: merchant_salt,
    merchantKey: merchant_key,
  });

  const payload = {
    merchant_id,
    paytr_token,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_type,
    payment_amount,
    installment_count,
    no_installment,
    max_installment,
    lang: "tr",
    client_lang: "tr",
    currency,
    test_mode,
    non_3d,
    recurring_payment: "1",
    sync_mode: "1",
    utoken,
    ctoken,
    merchant_ok_url: process.env.PAYTR_OK_URL || "https://sozderecekocluk.com/order-success",
    merchant_fail_url: process.env.PAYTR_FAIL_URL || "https://sozderecekocluk.com/payment-fail",
    user_name: userName,
    user_address: userAddress,
    user_phone: userPhone,
    user_basket,
  };

  try {
    const response = await axios.post(PAYTR_ENDPOINT, qs.stringify(payload), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    });
    const data = response.data;
    // Beklenen (sync_mode=1 ile): { status: "success"|"failed"|"wait_callback", msg, utoken, ctoken }
    if (data?.status === "success" || data?.status === "wait_callback") {
      return { status: data.status, raw: data };
    }
    return { status: "failed", reason: data?.msg || data?.status || "UNKNOWN", raw: data };
  } catch (err) {
    console.error("❌ chargeRecurring PayTR isteği başarısız:", err?.message);
    return { status: "failed", reason: "REQUEST_FAILED" };
  }
}

/** Kart-kaydı/ilk-ödeme callback'inin hash'ini doğrular (klasik akışla aynı imza şeması). */
export function verifyCallbackHash({ merchantOid, status, totalAmount, hash }) {
  const { merchant_key, merchant_salt } = getCreds();
  const hashStr = `${merchantOid}${merchant_salt}${status}${totalAmount}`;
  const expected = crypto.createHmac("sha256", merchant_key).update(hashStr).digest("base64");
  return expected === hash;
}
