import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import axios from "axios";
import qs from "querystring";
const prisma = new PrismaClient();

// Admin tüm siparişleri görür
export const getAllOrdersForAdmin = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: true,
        billingInfo: true,
      },
    });

    const formatted = orders.map((order) => ({
      id: order.id,
      package: order.package,
      createdAt: order.createdAt,
      status: order.status,
      startDate: order.startDate,
      endDate: order.endDate,
      userName: order.user?.name,
      userEmail: order.user?.email,
      billingInfo: order.billingInfo,
      merchantOid: order.merchantOid,
      totalPrice: order.totalPrice,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Admin siparişleri alınamadı:", error);
    res.status(500).json({ error: "Sipariş verisi alınamadı." });
  }
};

// Sipariş silme işlemi
export const deleteOrder = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.orderItem.deleteMany({
      where: { orderId: parseInt(id) },
    });

    await prisma.order.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Sipariş silindi." });
  } catch (error) {
    console.error("Sipariş silme hatası:", error);
    res.status(500).json({ message: "Sipariş silinemedi." });
  }
};

// İade taleplerini getir
export const getRefundRequests = async (req, res) => {
  try {
    const refundOrders = await prisma.order.findMany({
      where: { status: "refund_requested" },
      orderBy: { createdAt: "desc" },
      include: {
        billingInfo: true,
        user: true,
      },
    });

    res.status(200).json({ refundOrders });
  } catch (error) {
    console.error("İade talepleri alınamadı:", error);
    res.status(500).json({ error: "İade talepleri alınamadı." });
  }
};

// İade onayla
export const approveRefundRequest = async (req, res) => {
  const orderId = parseInt(req.params.id);
  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: "refunded" },
      include: { user: true },
    });

    await prisma.notification.create({
      data: {
        userId: updatedOrder.userId,
        message: `#${updatedOrder.id} numaralı siparişinizin iadesi onaylandı.`,
      },
    });

    res.status(200).json({ message: "İade onaylandı.", updatedOrder });
  } catch (error) {
    console.error("İade onayı başarısız:");
    res.status(500).json({ error: "İade onayı başarısız." });
  }
};

// İade reddet
export const rejectRefund = async (req, res) => {
  const orderId = parseInt(req.params.id);
  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: "active" },
      include: { user: true },
    });
    res.status(200).json({ message: "İade talebi reddedildi.", updatedOrder });
  } catch (err) {
    console.error("İade reddi hatası:", err);
    res.status(500).json({ error: "İade reddedilemedi." });
  }
};

// Sipariş güncelle
export const updateOrder = async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { endDate, status } = req.body;

  try {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(endDate && { endDate: new Date(endDate) }),
        ...(status && { status }),
      },
    });

    res.json({ message: "Sipariş güncellendi", order: updated });
  } catch (err) {
    console.error("Sipariş güncelleme hatası:", err);
    res.status(500).json({ error: "Sipariş güncellenemedi" });
  }
};

// Fatura bilgilerini güncelle
export const updateBillingInfo = async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { name, surname, email, phone, address, city, district, postalCode, allowEmails } = req.body;

  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        billingInfo: {
          update: {
            name,
            surname,
            email,
            phone,
            address,
            city,
            district,
            postalCode,
            allowEmails,
          },
        },
      },
      include: { billingInfo: true },
    });

    res.status(200).json({ message: "Fatura bilgileri güncellendi", updatedOrder });
  } catch (error) {
    console.error("Fatura bilgisi güncellenemedi:", error);
    res.status(500).json({ error: "Fatura bilgisi güncellenemedi." });
  }
};

export const checkPaytrStatus = async (req, res) => {
  const { merchant_oid } = req.body;

  try {
    const { PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT } = process.env;

    const hash_str = `${PAYTR_MERCHANT_ID}${merchant_oid}${PAYTR_MERCHANT_SALT}`;
    const paytr_token = crypto.createHmac("sha256", PAYTR_MERCHANT_KEY)
      .update(hash_str)
      .digest("base64");

    const response = await axios.post(
      "https://www.paytr.com/odeme/durum-sorgu",
      qs.stringify({
        merchant_id: PAYTR_MERCHANT_ID,
        merchant_oid,
        paytr_token,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    // Eğer başarılıysa veritabanını güncelle
    if (response.data.status === "success") {
      await prisma.order.updateMany({
  where: {
    merchantOid: merchant_oid,
    status: {
      in: ["pending", "pending_payment"], // İki ihtimali de kapsa
    },
  },
  data: { status: "paid" },
});

    }

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("⚠️ PayTR Durum Sorgu Hatası:");
    return res.status(500).json({ error: "Durum sorgulanamadı"});
  }
};