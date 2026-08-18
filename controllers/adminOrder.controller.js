import prisma from "../utils/prisma.js";

import crypto from "crypto";
import axios from "axios";
import qs from "querystring";
import { classifyChannel } from "../utils/classifyChannel.js";
import { deviceTypeLabel } from "../utils/parseUserAgent.js";


// Admin tüm siparişleri görür
export const getAllOrdersForAdmin = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: true,
        billingInfo: true,
      },
    });

    const merchantOids = orders.map((o) => o.merchantOid).filter(Boolean);
    const paymentMetas = await prisma.paymentMeta.findMany({
      where: { merchantOid: { in: merchantOids } },
      select: { merchantOid: true, couponCode: true, discountRate: true },
    });
    const metaMap = {};
    paymentMetas.forEach((m) => { metaMap[m.merchantOid] = m; });

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
      couponCode: order.merchantOid ? (metaMap[order.merchantOid]?.couponCode || null) : null,
      discountRate: order.merchantOid ? (metaMap[order.merchantOid]?.discountRate ?? null) : null,
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

    res.status(200).json({ message: "İade onaylandı.", updatedOrder });
  } catch (error) {
    console.error("İade onayı başarısız:", error);
    res.status(500).json({ error: "İade onayı başarısız." });
  }
};

// İade reddet
export const rejectRefund = async (req, res) => {
  const orderId = parseInt(req.params.id);
  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      // "paid" lifecycle'ına geri döner — aksi halde sipariş bir daha
      // asla yeniden iade talebine konu olamaz (createRefundRequest ve
      // sendExpiringOrderReminders yalnızca status:"paid" arıyor).
      data: { status: "paid" },
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
  const { name, surname, email, phone, address, city, district, postalCode, tcNo, allowEmails, sinif, alan } = req.body;

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
            tcNo,
            allowEmails,
            sinif,
            alan,
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

// Bir siparişin trafik kaynağını + o ziyaretçinin tüm oturum geçmişini döner.
// Sipariş listesine gömülmüyor — admin bir siparişi genişlettiğinde tek tek çağrılır.
export const getOrderAttribution = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, visitorId: true, visitorSessionId: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Sipariş bulunamadı." });

    if (!order.visitorId) {
      return res.json({ success: true, hasData: false });
    }

    const [convertingSession, allSessions] = await Promise.all([
      order.visitorSessionId
        ? prisma.visitorSession.findUnique({ where: { id: order.visitorSessionId } })
        : null,
      prisma.visitorSession.findMany({
        where: { visitorId: order.visitorId },
        orderBy: { startedAt: "asc" },
        select: { id: true, startedAt: true, utmSource: true, utmMedium: true, referrerDomain: true },
      }),
    ]);

    if (!convertingSession) {
      // Sipariş bir ziyaretçiye bağlı ama o anki oturum kaydı bulunamadı
      // (ör. veri temizleme cron'u tarafından süpürülmüş) — yine de ziyaretçinin
      // genel geçmişini gösterebiliriz, sadece üst anlık-görüntü paneli boş kalır.
      return res.json({
        success: true,
        hasData: true,
        snapshot: null,
        totalSessions: allSessions.length,
      });
    }

    const snapshotChannel = classifyChannel({
      utmSource: convertingSession.utmSource,
      utmMedium: convertingSession.utmMedium,
      referrerDomain: convertingSession.referrerDomain,
    });
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(convertingSession.lastActivityAt).getTime() - new Date(convertingSession.startedAt).getTime()) / 1000)
    );

    const convertingIndex = allSessions.findIndex((s) => s.id === convertingSession.id);
    const firstRaw = allSessions[0];
    const firstChannel = firstRaw
      ? classifyChannel({ utmSource: firstRaw.utmSource, utmMedium: firstRaw.utmMedium, referrerDomain: firstRaw.referrerDomain })
      : null;
    const middleSessionsCount = convertingIndex > 0 ? convertingIndex - 1 : 0;

    return res.json({
      success: true,
      hasData: true,
      snapshot: {
        headline: snapshotChannel.headline,
        icon: snapshotChannel.icon,
        referrer: convertingSession.referrer,
        referrerDomain: convertingSession.referrerDomain,
        deviceType: convertingSession.deviceType,
        deviceTypeLabel: deviceTypeLabel(convertingSession.deviceType),
        os: convertingSession.os,
        browser: convertingSession.browser,
        durationSeconds,
        landingPage: convertingSession.landingPage,
        utm: {
          source: convertingSession.utmSource,
          medium: convertingSession.utmMedium,
          campaign: convertingSession.utmCampaign,
          term: convertingSession.utmTerm,
          content: convertingSession.utmContent,
        },
        startedAt: convertingSession.startedAt,
      },
      totalSessions: allSessions.length,
      firstSession: firstRaw
        ? { id: firstRaw.id, startedAt: firstRaw.startedAt, headline: firstChannel.headline, icon: firstChannel.icon, isConverting: firstRaw.id === convertingSession.id }
        : null,
      convertingSession: { id: convertingSession.id, startedAt: convertingSession.startedAt, headline: snapshotChannel.headline, icon: snapshotChannel.icon },
      middleSessionsCount,
    });
  } catch (err) {
    console.error("getOrderAttribution error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};