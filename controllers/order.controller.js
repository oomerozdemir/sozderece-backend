import prisma from "../utils/prisma.js";

import axios from "axios";
import crypto from "crypto";
import qs from "qs";
import { sendPaymentSuccessEmail, sendEmail, emailShell } from "../utils/sendEmail.js";
import { v4 as uuidv4 } from "uuid";
import { cleanMerchantOid, cleanPrice, requireFields } from "../utils/helpers.js";
import { getPackageConfig } from "../utils/packageCatalog.js";
import { getAllValidUnitPrices } from "../utils/packagePricing.js";
import { finalizeSubscriptionStart, resolveChargeSuccess, resolveChargeFailure } from "./subscription.controller.js";

/* =========================
   Siparişleri getir (My Orders)
========================= */
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "Kullanıcı doğrulanamadı." });
    }

    const orders = await prisma.order.findMany({
      where: {
        userId,
        // "ödeme tamamlanmamış" siparişleri liste DIŞI bırak
        status: { notIn: ["pending", "pending_payment"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        billingInfo: true,
        orderItems: true,
        studentRequests: { select: { id: true } },
      },
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Siparişler alınamadı:", error?.message);
    res.status(500).json({ message: "Siparişler alınamadı." });
  }
};


/* =========================
   Sipariş Hazırla (PayTR token al)
========================= */
export const prepareOrder = async (req, res) => {
  try {
    let {
      cart,
      billingInfo,
      packageName,
      totalPrice,
      discountRate,
      couponCode,
      useServerCart,
      requestId,
      requestIds,
    } = req.body;

    const userId = req.user?.id;

    // Temel doğrulama
    if ((!cart && !useServerCart) || !billingInfo || !packageName) {
      return res.status(400).json({ error: "Eksik sipariş verisi" });
    }


    // 1) Server sepeti kullanılacaksa: aktif sepeti oku ve normalize et
    if (useServerCart) {
      const openCart = await prisma.cart.findFirst({
        where: { completed: false, userId },
        include: { items: true },
      });
      if (!openCart || openCart.items.length === 0) {
        return res.status(400).json({ error: "Sepet boş." });
      }
      cart = openCart.items.map((i) => ({
        name: i.title,
        price: (i.unitPrice / 100).toFixed(2),
        quantity: i.quantity || 1,
      }));
      totalPrice = (
        openCart.items.reduce((s, i) => s + i.unitPrice * (i.quantity || 1), 0) / 100
      ).toFixed(2);
    } else {
      if (isNaN(parseFloat(totalPrice))) {
        return res.status(400).json({ error: "Geçersiz fiyat verisi" });
      }
    }

    // 2) Cart temizliği
    const cleanedCart = (cart || []).map((item) => ({
      ...item,
      price: cleanPrice(item.price),
      quantity: item.quantity || 1,
    }));

    // 2b) Fiyat manipülasyonu koruması: useServerCart yolunda cart.controller.js
    // zaten sepete ekleme anında sunucu tarafında fiyatlandırıyor (güvenli).
    // Client'ın doğrudan gönderdiği sepette ise slug'ı bir Package'a karşılık
    // gelen her kalemin fiyatı, o paketin o an geçerli meşru fiyatlarından
    // biriyle eşleşmeli — aksi halde devtools'tan düşürülmüş bir tutarla
    // ödeme tamamlanabilir.
    if (!useServerCart) {
      for (const item of cleanedCart) {
        if (!item.slug) continue;
        const dbPkg = await prisma.package.findUnique({ where: { slug: item.slug } });
        if (!dbPkg) continue; // Package tablosunda yok (ör. özel ders kalemi) — kapsam dışı
        const validPrices = getAllValidUnitPrices(dbPkg);
        const claimedKurus = Math.round(item.price * 100);
        const matches = validPrices.some((p) => Math.abs(p - claimedKurus) <= 1);
        if (!matches) {
          console.warn(
            `🚨 prepareOrder fiyat uyuşmazlığı: slug=${item.slug} claimed=${claimedKurus} valid=[${validPrices.join(",")}]`
          );
          return res.status(400).json({ error: "Fiyat bilgisi doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin." });
        }
      }
    }

    const test_mode = process.env.PAYTR_TEST_MODE || "0";
    const merchantOid = cleanMerchantOid(uuidv4());

    // 3) PayTR token al
    const paytrPayload = {
      user: req.user,
      merchantOid,
      cart: cleanedCart,
      totalPrice,
      test_mode,
      user_name: `${billingInfo.name} ${billingInfo.surname}`.trim(),
      user_address: billingInfo.address,
      user_phone: billingInfo.phone,
      billingEmail: billingInfo.email,
    };

    const tokenResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/paytr/initiate`,
      paytrPayload,
      { headers: { Authorization: req.headers.authorization } }
    );

    const { token } = tokenResponse.data || {};
    if (!token) {
      console.error("🚨 PayTR'den token alınamadı.");
      return res.status(500).json({ error: "Ödeme token alınamadı" });
    }

    // 4) PaymentMeta oluştur
    await prisma.paymentMeta.create({
      data: {
        merchantOid,
        userId,
        cart: cleanedCart,
        billingInfo,
        packageName,
        packageSlug: req.body.packageSlug || cleanedCart?.[0]?.slug || null,
        discountRate: discountRate ? parseInt(discountRate) : 0, 
        couponCode,
        totalPrice,
        requestId: requestId || null,
      },
    });

    // 5) Talep(ler)i sepette işaretle (orderId vermeden)
    const ids = []
      .concat(requestIds || [])
      .concat(requestId ? [requestId] : [])
      .filter(Boolean)
      .map(String);

    if (ids.length > 0) {
      try {
        await prisma.studentLessonRequest.updateMany({
          where: { id: { in: ids }, status: { notIn: ["PAID", "CANCELLED"] } },
          data: { status: "PACKAGE_SELECTED" }, // orderId bağlamıyoruz
        });
      } catch (e) {
        console.warn("StudentLessonRequest ilişkilendirme uyarısı:", e?.message);
      }
    }

    // 6) FE'ye token ve merchantOid dön
    return res.json({ token, merchantOid });
  } catch (err) {
    console.error("❌ prepareOrder hatası:", err);
    return res.status(500).json({ error: "Sipariş hazırlanırken hata oluştu" });
  }
};


/* =========================
   PayTR Callback
========================= */
export const handlePaytrCallback = async (req, res) => {
  try {
    const { merchant_oid, status, total_amount, hash, utoken, ctoken } = req.body;

    // 0) Hash doğrulama
    const hashStr = `${merchant_oid}${process.env.PAYTR_MERCHANT_SALT}${status}${total_amount}`;
    const expectedHash = crypto
      .createHmac("sha256", process.env.PAYTR_MERCHANT_KEY)
      .update(hashStr)
      .digest("base64");

    if (expectedHash !== hash) {
      console.warn("❌ PayTR hash doğrulama başarısız");
      return res.status(403).send("INVALID HASH");
    }

    // 0b) Abonelik başlatma (kart kaydı) mı? PayTR'nin tek/sabit bildirim
    // URL'si her callback'i buraya gönderiyor — mevcut tek-seferlik sipariş
    // akışıyla aynı yoldan geçip PaymentMeta'daki işarete göre ayrılıyor.
    const pmCheckEarly = await prisma.paymentMeta.findUnique({ where: { merchantOid: merchant_oid } });
    if (pmCheckEarly?.cart?.[0]?.isSubscriptionStart) {
      const existingOrder = await prisma.order.findUnique({ where: { merchantOid: merchant_oid } });
      if (existingOrder) return res.send("OK"); // idempotans

      const result = await finalizeSubscriptionStart({
        pm: pmCheckEarly,
        merchantOid: merchant_oid,
        status,
        utoken,
        ctoken,
      });
      if (!result.ok) {
        console.warn(`⚠️ Abonelik başlatma finalize edilemedi (${merchant_oid}):`, result.reason);
      }
      return res.send("OK");
    }

    // 0c) Bekleyen bir aylık abonelik çekimi mi? (sync_mode yanıtı "wait_callback"
    // dönüp cron kesin sonucu bu asenkron callback'e bıraktığında buraya düşer —
    // bkz. cron/subscriptionBilling.js + utils/paytrRecurring.js sync_mode notları.
    // resolveChargeSuccess/Failure zaten idempotent (pending değilse no-op),
    // yani sync_mode yanıtı cron'da zaten kesinleşmişse burada tekrar işlenmez.
    const pendingCharge = await prisma.subscriptionCharge.findUnique({ where: { merchantOid: merchant_oid } });
    if (pendingCharge) {
      if (status === "success") {
        await resolveChargeSuccess({ subscriptionId: pendingCharge.subscriptionId, merchantOid: merchant_oid });
      } else {
        await resolveChargeFailure({ subscriptionId: pendingCharge.subscriptionId, merchantOid: merchant_oid, reason: status });
      }
      return res.send("OK");
    }

    // 1) Order'ı bul / yoksa paymentMeta'dan oluştur
    let order = await prisma.order.findUnique({
      where: { merchantOid: merchant_oid },
    });

    if (!order) {
      const pmForCreate = await prisma.paymentMeta.findUnique({
        where: { merchantOid: merchant_oid },
      });
      if (!pmForCreate) {
        console.error("❌ paymentMeta da bulunamadı:", merchant_oid);
        return res.status(404).send("ORDER NOT FOUND");
      }

      order = await prisma.order.create({
        data: {
          ...(pmForCreate.userId ? { user: { connect: { id: pmForCreate.userId } } } : {}),
          merchantOid: merchant_oid,
          totalPrice: pmForCreate.totalPrice,
          status: "pending",
          package: pmForCreate.packageName,
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          billingInfo: { create: pmForCreate.billingInfo },
          orderItems: {
            create: (Array.isArray(pmForCreate.cart) ? pmForCreate.cart : []).map((item) => ({
              name: item.name ?? item.title ?? "Ürün",
              price: Number(item.price) || 0,
              quantity: Number(item.quantity) || 1,
              description: item.description || null,
            })),
          },
        },
      });
      console.log("🆕 Order oluşturuldu:", order.id);
    }

    // 2) İdempotent çıkış
    if (order.status === "paid") {
      return res.send("OK");
    }

    if (status === "success") {
      // 2a) Ödeme tutarı doğrulama — price manipulation koruması
      // PayTR'nin gönderdiği total_amount (kuruş) ile paymentMeta'daki beklenen tutar karşılaştırılır.
      const pmCheck = await prisma.paymentMeta.findUnique({ where: { merchantOid: merchant_oid } });
      if (pmCheck?.totalPrice) {
        const paidAmountTL = parseFloat(total_amount) / 100;
        const expectedAmountTL = parseFloat(pmCheck.totalPrice);
        // 1 TL veya %1 tolerans (float hassasiyeti için)
        if (Math.abs(paidAmountTL - expectedAmountTL) > Math.max(1, expectedAmountTL * 0.01)) {
          console.error(
            `❌ Ödeme tutarı uyuşmuyor! Beklenen: ${expectedAmountTL} TL | Gelen: ${paidAmountTL} TL | OID: ${merchant_oid}`
          );
          await prisma.order.update({ where: { id: order.id }, data: { status: "failed" } });
          return res.send("OK"); // PayTR'e OK dön ama siparişi onaylama
        }
      }

      // 3) Guest ise fatura bilgilerinden öğrenci hesabı oluştur
      if (!order.userId) {
        try {
          const pmGuest = await prisma.paymentMeta.findUnique({ where: { merchantOid: merchant_oid } });
          const bi = pmGuest?.billingInfo;
          if (bi?.email) {
            const upserted = await prisma.user.upsert({
              where: { email: bi.email },
              update: {},
              create: {
                email: bi.email,
                name: `${bi.name || ""} ${bi.surname || ""}`.trim() || null,
                phone: bi.phone || null,
                grade: bi.sinif || null,
                track: bi.alan || null,
                role: "student",
                isVerified: true,
                emailVerified: true,
              },
            });
            await prisma.order.update({ where: { id: order.id }, data: { userId: upserted.id } });
            order = { ...order, userId: upserted.id };

            const isNew = upserted.createdAt.getTime() > Date.now() - 15000;
            if (isNew) {
              try {
                const loginUrl = `${process.env.FRONTEND_URL}/giris-yap`;
                await sendEmail({
                  to: bi.email,
                  subject: "[Sözderece] Hesabınız Hazır",
                  html: emailShell({
                    eyebrow: "Hoş Geldin",
                    title: "Hesabın hazır 🎉",
                    subtitle: `Merhaba ${bi.name || ""}, ödemen başarıyla alındı.`,
                    bodyHtml: `
                      <p style="font-size:14px; color:#6b7280; line-height:1.6;">
                        Sözderece hesabın otomatik olarak oluşturuldu. Aşağıdaki e-posta adresinle giriş yapabilirsin —
                        şifre oluşturmak için giriş ekranındaki "Şifremi Unuttum" seçeneğini kullanman yeterli.
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fa; border:1px solid #eeeaf7; border-radius:14px; padding:2px 18px; margin:14px 0;">
                        <tr>
                          <td style="padding:7px 0; font-size:13px; color:#6b7280;">E-posta adresin</td>
                          <td style="padding:7px 0; font-size:14px; color:#1e1b3a; font-weight:700; text-align:right;">${bi.email}</td>
                        </tr>
                      </table>`,
                    ctaLabel: "Giriş Yap",
                    ctaUrl: loginUrl,
                  }),
                });
              } catch (e) { console.warn("Hoş geldin maili gönderilemedi:", e?.message); }
            }
          }
        } catch (e) { console.warn("Otomatik hesap oluşturulamadı:", e?.message); }
      }

      // 4) Order'ı PAID yap
      order = await prisma.order.update({
        where: { id: order.id },
        data: { status: "paid" },
      });

      // 4) Talebi bağla ve PAID yap (öncelik: paymentMeta.requestId)
      try {
        const pm = await prisma.paymentMeta.findUnique({
          where: { merchantOid: merchant_oid },
        });

        if (pm?.requestId) {
          // Bu siparişe bağla + PAID
          try {
            await prisma.studentLessonRequest.update({
              where: { id: String(pm.requestId) },
              data: {
                status: "PAID",
                order: { connect: { id: order.id } },
              },
            });
          } catch (e) {
            console.warn("Request bağlama sırasında uyarı:", e?.message);
            await prisma.studentLessonRequest.updateMany({
              where: { id: String(pm.requestId) },
              data: { status: "PAID" },
            });
          }
        }

        // Ek garanti: Bu orderId'ye zaten bağlı olan talep(ler) varsa, onları da PAID yap
        await prisma.studentLessonRequest.updateMany({
          where: { orderId: order.id, status: { not: "PAID" } },
          data: { status: "PAID" },
        });
      } catch (e) {
        console.warn("Talep PAID güncellemesi atlandı:", e?.message);
      }

      // 5) (YENİ) Ücretsiz özel ders hakkı tanımla — BE kataloğu kullanılıyor
      try {
        const pm = await prisma.paymentMeta.findUnique({
          where: { merchantOid: merchant_oid },
        });

        // Sırayla dene: slug → paymentMeta.packageName → order.package → cart[0].slug → cart[0].name
        const firstItem = Array.isArray(pm?.cart) ? pm.cart[0] : null;
        const keysToTry = [
          pm?.packageSlug,          // şemanda yoksa undefined olur; sorun değil
          pm?.packageName,
          order?.package,
          firstItem?.slug,
          firstItem?.name,
        ].filter(Boolean);

        let pkgConf = null;
        for (const k of keysToTry) {
          const found = getPackageConfig(k);
          if (found) { pkgConf = found; break; }
        }

        if (pkgConf && Number(pkgConf.freeLessons) > 0) {
          const freeLessons = Number(pkgConf.freeLessons);
          const period = pkgConf.period || "once";
          const targetUserId = order.userId || pm?.userId;

          if (targetUserId) {
            // Aynı paket/period için var mı? Varsa artır, yoksa oluştur
            const existing = await prisma.studentPackageRight.findFirst({
              where: {
                studentId: targetUserId,
                packageSlug: pkgConf.key,
                period,
              },
            });

            if (existing) {
              await prisma.studentPackageRight.update({
                where: { id: existing.id },
                data: {
                  isActive: true,
                  rightsTotal: { increment: freeLessons },
                },
              });
            } else {
              await prisma.studentPackageRight.create({
                data: {
                  studentId: targetUserId,
                  packageSlug: pkgConf.key,
                  period,
                  rightsTotal: freeLessons,
                  rightsUsed: 0,
                  isActive: true,
                },
              });
            }
          }
        } else {
          console.log("ℹ️ Ücretsiz hak tanımı yok/0:", keysToTry[0]);
        }
      } catch (e) {
        console.warn("Ücretsiz ders hakkı tanımlanamadı:", e?.message);
      }

      // 6) user/email'i tek seferde al
      const [user, billingInfo] = await Promise.all([
        order.userId ? prisma.user.findUnique({ where: { id: order.userId } }) : Promise.resolve(null),
        order.billingInfoId ? prisma.billingInfo.findUnique({ where: { id: order.billingInfoId } }) : Promise.resolve(null),
      ]);
      const targetEmail = user?.email || billingInfo?.email || null;

      // 7) Açık sepet(ler)i completed:true yap (userId veya email'e göre)
      try {
        const whereOr = [];
        if (order.userId) whereOr.push({ userId: order.userId });
        if (targetEmail) whereOr.push({ email: targetEmail });

        if (whereOr.length > 0) {
          await prisma.cart.updateMany({
            where: { completed: false, OR: whereOr },
            data: { completed: true },
          });
        }
      } catch (e) {
        console.warn("Cart completion update skipped:", e?.message);
      }

      // 8) Kupon kullanımını işle
      try {
        const pm = await prisma.paymentMeta.findUnique({ where: { merchantOid: merchant_oid } });
        if (pm?.couponCode) {
          const alreadyUsed = await prisma.couponUsage.findFirst({
            where: { userId: pm.userId, coupon: { code: pm.couponCode } },
          });
          if (!alreadyUsed) {
            await prisma.couponUsage.create({
              data: {
                userId: pm.userId,
                coupon: { connect: { code: pm.couponCode } },
              },
            });
          }
        }
      } catch (e) {
        console.warn("Kupon kullanım kaydı atlandı:", e?.message);
      }

      // 9) Ödeme başarılı maili (order objesiyle, eksik alanları PM'den tamamla)
      if (targetEmail) {
        try {
          const [fullOrder, pmForEmail] = await Promise.all([
            prisma.order.findUnique({
              where: { id: order.id },
              include: { billingInfo: true },
            }),
            prisma.paymentMeta.findUnique({ where: { merchantOid: merchant_oid } }),
          ]);

          const discountRate = Number(pmForEmail?.discountRate || 0);
          const couponCode = pmForEmail?.couponCode || null;
          const totalPriceNum = Number(fullOrder?.totalPrice || 0);
          const originalPrice =
            discountRate > 0 ? totalPriceNum / (1 - discountRate / 100) : totalPriceNum;

          await sendPaymentSuccessEmail(targetEmail, {
            id: fullOrder.id,
            package: fullOrder.package,
            startDate: fullOrder.startDate,
            endDate: fullOrder.endDate,
            totalPrice: totalPriceNum,
            discountRate,
            couponCode,
            originalPrice,
            billingInfo: fullOrder.billingInfo,
          });
          console.log("✅ Mail başarıyla gönderildi");
        } catch (err) {
          console.error("❌ Mail gönderilemedi:", err);
        }
      } else {
        console.warn("⚠️ Mail adresi bulunamadı. Mail gönderimi atlandı.");
      }

      console.log("✅ Ödeme başarılı");
    } else {
      // Ödeme başarısız
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "failed" },
      });
      console.log("⚠️ Ödeme başarısız");
    }

    res.send("OK");
  } catch (error) {
    console.error("⚠️ PayTR callback hatası:", error);
    res.status(500).send("SERVER ERROR");
  }
};

/* =========================
   PayTR Token (sunucu tarafı)
========================= */
export const initiatePaytrPayment = async (req, res) => {
  try {
    const { cart, totalPrice, test_mode, user_name, user_address, user_phone } = req.body;

    const merchantOid = cleanMerchantOid(req.body.merchantOid);
    const user = req.user;

    const email = user?.email || req.body.billingEmail || null;
    if (!email) {
      return res.status(400).json({ error: "E-posta adresi eksik" });
    }

    requireFields({ cart, totalPrice, merchantOid, user_name, user_address, user_phone });

    const merchant_id = process.env.PAYTR_MERCHANT_ID.trim();
    const merchant_key = process.env.PAYTR_MERCHANT_KEY.trim();
    const merchant_salt = process.env.PAYTR_MERCHANT_SALT.trim();

    const user_basket = Buffer.from(
      JSON.stringify(
        cart.map((item) => [
          item.name,
          Math.round(cleanPrice(item.price) * 100),
          item.quantity || 1,
        ])
      )
    ).toString("base64");

    const user_ip =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      "127.0.0.1";

    const payment_amount = parseInt((parseFloat(totalPrice) * 100).toFixed(0));
    const currency = "TL";
    const no_installment = "0";
    const max_installment = "0";
    const timeout_limit = "30";
    const debug_on = "1";

    const hash_str =
      merchant_id +
      user_ip +
      merchantOid +
      email +
      payment_amount +
      user_basket +
      no_installment +
      max_installment +
      currency +
      test_mode;

    const paytr_token = crypto
      .createHmac("sha256", merchant_key)
      .update(hash_str + merchant_salt)
      .digest("base64");

    const paytrData = {
      merchant_id,
      user_ip,
      merchant_oid: merchantOid,
      email,
      payment_amount,
      paytr_token,
      user_basket,
      no_installment,
      max_installment,
      currency,
      test_mode,
      user_name,
      user_address,
      user_phone,
      merchant_ok_url: process.env.PAYTR_OK_URL,
      merchant_fail_url: process.env.PAYTR_FAIL_URL,
      timeout_limit,
      debug_on,
      lang: "tr",
    };

    const response = await axios.post(
      "https://www.paytr.com/odeme/api/get-token",
      qs.stringify(paytrData),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    if (!response.data?.token) {
      // PayTR'nin ret sebebini (ör. hesap yetkisi/ayar çakışması) sunucu
      // logunda görünür kıl — önceden burada sessizce yutuluyordu ve gerçek
      // sebep sadece "Sipariş hazırlanırken hata oluştu" olarak görünüyordu.
      console.error("🚨 PayTR token alınamadı:", JSON.stringify(response.data));
      return res.status(500).json({ error: "PayTR token alınamadı", reason: response.data?.reason });
    }

    return res.json({ token: response.data.token });
  } catch (error) {
    console.error("🚨 initiatePaytrPayment hatası:", error?.response?.data || error?.message);
    return res.status(500).json({ error: "Ödeme başlatılamadı" });
  }
};

/* =========================
   İade talebi
========================= */
export const createRefundRequest = async (req, res) => {
  const userId = req.user.id;
  const orderId = parseInt(req.params.id);
  const { reason, description } = req.body;

  if (!reason) {
    return res.status(400).json({ message: "İade nedeni gereklidir." });
  }

  try {
    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, userId: userId, status: "paid" },
    });

    if (!existingOrder) {
      return res.status(404).json({ message: "Sipariş bulunamadı veya aktif değil." });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "refund_requested",
        refundReason: reason,
        refundMessage: description,
      },
    });

    res.status(200).json({ message: "İade talebi oluşturuldu." });
  } catch (error) {
    console.error("İade talebi hatası:", error?.message);
    res.status(500).json({ message: "Sunucu hatası." });
  }
};