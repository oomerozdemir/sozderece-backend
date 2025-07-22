import { PrismaClient } from "@prisma/client";
import axios from "axios";
import crypto from "crypto";
import qs from "qs"; 
import { sendPaymentSuccessEmail } from "../utils/sendEmail.js"
import { v4 as uuidv4 } from "uuid";
import { cleanMerchantOid, cleanPrice, requireFields } from "../utils/helpers.js";




const prisma = new PrismaClient();
// Siparişleri getir
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "Kullanıcı doğrulanamadı." });
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        billingInfo: true,
        orderItems: true,
      },
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Siparişler alınamadı:");
    res.status(500).json({ message: "Siparişler alınamadı." });
  }
};


export const prepareOrder = async (req, res) => {
  try {

    const {
      cart,
      billingInfo,
      packageName,
      totalPrice,
      discountRate,
      couponCode,
    } = req.body;

    const userId = req.user.id;

    if (!cart || !billingInfo || !packageName || !totalPrice) {
      return res.status(400).json({ error: "Eksik sipariş verisi" });
    }

    if (isNaN(parseFloat(totalPrice))) {
      return res.status(400).json({ error: "Geçersiz fiyat verisi" });
    }



    const cleanedCart = cart.map((item) => ({
      ...item,
      price: cleanPrice(item.price),
      quantity: item.quantity || 1,
    }));

    const test_mode = process.env.PAYTR_TEST_MODE || "0";

    // ✅ Özel karakter temizliği
  const merchantOid = cleanMerchantOid(uuidv4());


    const paytrPayload = {
      user: req.user,
      merchantOid,
      cart: cleanedCart,
      totalPrice,
      test_mode,
      user_name: billingInfo.name + " " + billingInfo.surname,
      user_address: billingInfo.address,
      user_phone: billingInfo.phone
    };

    const tokenResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/paytr/initiate`,
      paytrPayload,
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );

    const { token } = tokenResponse.data;

    if (!token) {
      console.error("🚨 PayTR'den token alınamadı:");
      return res.status(500).json({ error: "Ödeme token alınamadı" });
    }

    await prisma.paymentMeta.create({
      data: {
        merchantOid,
        userId,
        cart: cleanedCart,
        billingInfo,
        packageName,
        discountRate,
        couponCode,
        totalPrice,
      },
    });

    return res.json({ token });
  } catch (err) {
    console.error("❌ prepareOrder hatası:", err);
    return res.status(500).json({ error: "Sipariş hazırlanırken hata oluştu" });
  }
};



export const handlePaytrCallback = async (req, res) => {
  try {
    const { merchant_oid, status, total_amount, hash } = req.body;

    const hashStr = `${merchant_oid}${process.env.PAYTR_MERCHANT_SALT}${status}${total_amount}`;
    const expectedHash = crypto
      .createHmac("sha256", process.env.PAYTR_MERCHANT_KEY)
      .update(hashStr)
      .digest("base64");

    if (expectedHash !== hash) {
      console.warn("❌ PayTR hash doğrulama başarısız");
      return res.status(403).send("INVALID HASH");
    }

    let order = await prisma.order.findUnique({
      where: { merchantOid: merchant_oid },
    });

    if (!order) {
      const paymentMeta = await prisma.paymentMeta.findUnique({
        where: { merchantOid: merchant_oid },
      });

      if (!paymentMeta) {
        console.error("❌ paymentMeta da bulunamadı:");
        return res.status(404).send("ORDER NOT FOUND");
      }

     order = await prisma.order.create({
  data: {
    user: {
      connect: { id: paymentMeta.userId },
    },
    merchantOid: merchant_oid,
    totalPrice: paymentMeta.totalPrice,
    status: "pending",
    package: paymentMeta.packageName,
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Örnek: 30 gün sonrası
    billingInfo: {
      create: paymentMeta.billingInfo,
    },
    orderItems: {
      create: paymentMeta.cart.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    },
  },
});


      console.log("🆕 Order oluşturuldu:");
    }

    if (order.status === "paid") {
      return res.send("OK");
    }

    if (status === "success") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "paid" },
      });

      const paymentMeta = await prisma.paymentMeta.findUnique({
        where: { merchantOid: merchant_oid },
      });

      if (paymentMeta?.couponCode) {
        const alreadyUsed = await prisma.couponUsage.findFirst({
          where: {
            userId: paymentMeta.userId,
            coupon: {
              code: paymentMeta.couponCode,
            },
          },
        });

        if (!alreadyUsed) {
          await prisma.couponUsage.create({
            data: {
              userId: paymentMeta.userId,
              coupon: {
                connect: {
                  code: paymentMeta.couponCode,
                },
              },
            },
          });
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: order.userId },
      });

      const billingInfo = await prisma.billingInfo.findUnique({
        where: { id: order.billingInfoId },
      });

      const targetEmail = user?.email || billingInfo?.email;

      if (targetEmail) {
        try {
          await sendPaymentSuccessEmail(targetEmail, order.id);
          console.log("✅ Mail başarıyla gönderildi");
        } catch (err) {
          console.error("❌ Mail gönderilemedi:", err);
        }
      } else {
        console.warn("⚠️ Mail adresi bulunamadı. Mail gönderimi atlandı.");
      }

      console.log("✅ Ödeme başarılı");
    } else {
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


export const initiatePaytrPayment = async (req, res) => {
  try {
    const {
      cart,
      totalPrice,
      test_mode,
      user_name,
      user_address,
      user_phone,
    } = req.body;

    const merchantOid = cleanMerchantOid(req.body.merchantOid);
    const user = req.user;

   

    if (!user || !user.email) {
      return res.status(400).json({ error: "Kullanıcı verisi eksik veya geçersiz" });
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

    const email = user.email;
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
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!response.data?.token) {
      console.error("🚨 PayTR token alınamadı:");
      return res.status(500).json({ error: "PayTR token alınamadı"});
    }

    return res.json({ token: response.data.token });
  } catch (error) {

    return res.status(500).json({
      error: "Ödeme başlatılamadı"
    });
  }
};



// İade talebi oluştur
export const createRefundRequest = async (req, res) => {
  const userId = req.user.id;
  const orderId = parseInt(req.params.id);
  const { reason, description  } = req.body;

  if (!reason) {
    return res.status(400).json({ message: "İade nedeni gereklidir." });
  }

  try {
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
        status: "paid"
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: "Sipariş bulunamadı veya aktif değil." });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "refund_requested",
        refundReason: reason,
        refundMessage: description
      }
    });

    res.status(200).json({ message: "İade talebi oluşturuldu." });
  } catch (error) {
    console.error("İade talebi hatası:");
    res.status(500).json({ message: "Sunucu hatası." });
  }
};
