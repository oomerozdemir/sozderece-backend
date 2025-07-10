import { PrismaClient } from "@prisma/client";
import axios from "axios";
import crypto from "crypto";


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
    console.error("Siparişler alınamadı:", error);
    res.status(500).json({ message: "Siparişler alınamadı." });
  }
};

// Sipariş oluştur
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

    // ✅ Ödeme tutarını hesapla
    const totalPrice = orderItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    const discountedPrice =
      couponCode && discountRate > 0
        ? totalPrice * (1 - discountRate / 100)
        : totalPrice;

    const payment_amount = Math.round(discountedPrice * 100); // kuruş

    // ✅ PAYTR TOKEN OLUŞTUR
    const merchant_id = process.env.PAYTR_MERCHANT_ID;
    const merchant_key = process.env.PAYTR_MERCHANT_KEY;
    const merchant_salt = process.env.PAYTR_MERCHANT_SALT;

    const user_ip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";

    const merchant_oid = `ORDER_${Date.now()}_${userId}`;

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
    const test_mode = process.env.PAYTR_TEST_MODE || "1";

    const hash_str = `${merchant_id}${user_ip}${merchant_oid}${billingInfoData.email}${payment_amount}${user_basket}${no_installment}${max_installment}${currency}${test_mode}`;

    const paytr_token = crypto
      .createHmac("sha256", merchant_key)
      .update(hash_str + merchant_salt)
      .digest("base64");

    const paytrRes = await axios.post(
      "https://www.paytr.com/odeme/api/get-token",
      null,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        params: {
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
          merchant_ok_url: "https://sozderece-frontend.vercel.app/payment-success",
          merchant_fail_url: "https://sozderece-frontend.vercel.app/payment-fail",
        },
      }
    );

    if (!paytrRes.data?.token) {
      throw new Error("PayTR token alınamadı");
    }

    // ✅ Fatura bilgisi oluştur
    const billingInfo = await prisma.billingInfo.create({
      data: { ...billingInfoData },
    });

    // ✅ Sipariş oluştur
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
      },
    });

    await prisma.orderItem.createMany({
      data: orderItems.map((item) => ({
        ...item,
        orderId: order.id,
      })),
    });

    // ✅ Kupon uygula
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
    console.error("💥 Sipariş oluşturulurken hata:", error.message);
    return res.status(500).json({ error: "Sipariş oluşturulamadı." });
  }
};



// İade talebi oluştur
export const createRefundRequest = async (req, res) => {
  const userId = req.user.id;
  const orderId = parseInt(req.params.id);
  const { reason, explanation } = req.body;

  try {
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
        status: "active"
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
        refundMessage: explanation
      }
    });

    res.status(200).json({ message: "İade talebi oluşturuldu." });
  } catch (error) {
    console.error("İade talebi hatası:", error);
    res.status(500).json({ message: "Sunucu hatası." });
  }
};
