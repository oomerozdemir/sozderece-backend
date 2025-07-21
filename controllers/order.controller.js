import { PrismaClient } from "@prisma/client";
import axios from "axios";
import crypto from "crypto";
import qs from "querystring";
import { sendPaymentSuccessEmail } from "../utils/sendEmail.js"
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";




const prisma = new PrismaClient();
dotenv.config();
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

// Sipariş oluştur
/*
export const createOrderWithBilling = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      billingInfo: billingInfoData,
      cart,
      packageName,
      couponCode,
      discountRate = 0,
    } = req.body;

    const cleanString = (value) =>
      typeof value === "string" ? value.replace(/\u0000/g, "") : "";

    const orderItems = cart.map((item) => ({
      name: cleanString(item.name),
      price: typeof item.price === "string"
        ? parseFloat(item.price.replace("₺", "").replace(/[^\d.]/g, ""))
        : item.price,
      quantity: item.quantity || 1,
      description: cleanString(item.description),
    }));

    const totalPrice = orderItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    const discountedPrice =
      couponCode && discountRate > 0
        ? totalPrice * (1 - discountRate / 100)
        : totalPrice;

    const payment_amount = Math.round(discountedPrice * 100); // kuruş

    const merchant_id = process.env.PAYTR_MERCHANT_ID;
    const merchant_key = process.env.PAYTR_MERCHANT_KEY;
    const merchant_salt = process.env.PAYTR_MERCHANT_SALT;

    const user_ip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";

    const merchant_oid = `ORDER${Date.now()}${userId}`;

    const user_basket = Buffer.from(
      JSON.stringify(
        orderItems.map((item) => [
          item.name,
          item.price.toFixed(2),
          item.quantity,
        ])
      )
    ).toString("base64");

    const no_installment = 0;
    const max_installment = 0;
    const currency = "TL";
    const test_mode = process.env.PAYTR_TEST_MODE || "0";

    const hash_str = `${merchant_id}${user_ip}${merchant_oid}${billingInfoData.email}${payment_amount}${user_basket}${no_installment}${max_installment}${currency}${test_mode}`;

    const paytr_token = crypto
      .createHmac("sha256", merchant_key)
      .update(hash_str + merchant_salt)
      .digest("base64");

    const paytrData = {
      merchant_id,
      user_ip,
      merchant_oid,
      email: billingInfoData.email,
      payment_amount,
      paytr_token,
      user_basket,
      no_installment,
      max_installment,
      currency,
      test_mode,
      user_name: billingInfoData.name + " " + billingInfoData.surname,
      user_address: billingInfoData.address,
      user_phone: billingInfoData.phone,
     callback_url: "https://sozderece-backend.onrender.com/api/orders/paytr/callback",
  merchant_ok_url: "https://sozderecekocluk.com/order-success",
  merchant_fail_url: "https://sozderecekocluk.com/payment-fail",
    };

    const paytrRes = await axios.post(
      "https://www.paytr.com/odeme/api/get-token",
      qs.stringify(paytrData),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!paytrRes.data?.token) {
      throw new Error("PayTR token alınamadı");
    }

    const billingInfo = await prisma.billingInfo.create({
      data: { ...billingInfoData },
    });

    const now = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(now.getMonth() + 1);

    const order = await prisma.order.create({
      data: {
        package: packageName,
        startDate: now,
        endDate: oneMonthLater,
        user: { connect: { id: userId } },
        billingInfo: { connect: { id: billingInfo.id } },
        status: "pending_payment",
        merchantOid: merchant_oid,
        totalPrice: discountedPrice,
      },
    });

    await prisma.orderItem.createMany({
      data: orderItems.map((item) => ({
        ...item,
        orderId: order.id,
      })),
    });

    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode },
        include: { usedBy: true },
      });

      if (
        coupon &&
        !coupon.usedBy.some((u) => u.id === userId) &&
        coupon.usedBy.length < coupon.usageLimit
      ) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            usedCoupons: {
              connect: { id: coupon.id },
            },
          },
        });
      }
    }

    return res.status(201).json({
      message: "Sipariş başarıyla oluşturuldu.",
      paytrToken: paytrRes.data.token,
      orderId: order.id,
    });
  } catch (error) {
    console.error("❌ Sipariş oluşturulurken hata:");
    return res.status(500).json({
      error: "Sipariş oluşturulamadı.",
      detail: error.message,
    });
  }
};
*/


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

    const test_mode = process.env.PAYTR_TEST_MODE || "1";
    const merchantOid = uuidv4();

    const paytrPayload = {
      user: req.user,
      merchantOid,
      cart,
      totalPrice,
      test_mode,
    };

    const tokenResponse = await axios.post(
  `${process.env.BACKEND_URL}/api/paytr/initiate`,
  paytrPayload
);

    const { token } = tokenResponse.data;

    if (!token) {
      console.error("🚨 PayTR'den token alınamadı:", tokenResponse.data);
      return res.status(500).json({ error: "Ödeme token alınamadı" });
    }

    await prisma.paymentMeta.create({
      data: {
        merchantOid,
        userId,
        cart,
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

    const order = await prisma.order.findUnique({
      where: { merchantOid: merchant_oid },
    });

    if (!order) {
      console.error("❌ Sipariş bulunamadı:", merchant_oid);
      return res.status(404).send("ORDER NOT FOUND");
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
    const { user, merchantOid, cart, totalPrice, test_mode } = req.body;

    // 🧮 Sipariş toplamını kuruş cinsine çevir
    const payment_amount = Math.round(parseFloat(totalPrice) * 100);

    const user_ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const merchant_id = process.env.PAYTR_MERCHANT_ID;
    const merchant_key = process.env.PAYTR_MERCHANT_KEY;
    const merchant_salt = process.env.PAYTR_MERCHANT_SALT;

    // 🔐 Token oluştur
    const hash_str = merchant_id + user_ip + merchantOid + user.email + payment_amount + test_mode + merchant_salt;
    const paytr_token = crypto
      .createHmac("sha256", merchant_key)
      .update(hash_str)
      .digest("base64");

    // 💳 PayTR iframe endpoint’ine istek
    return res.json({
      token: paytr_token,
    });
  } catch (err) {
    console.error("initiatePaytrPayment hatası:", err);
    return res.status(500).json({ error: "Ödeme başlatılamadı" });
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
