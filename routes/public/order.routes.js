import express from "express";
import { getMyOrders, createOrderWithBilling, createRefundRequest } from "../../controllers/order.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const router = express.Router();

router.get("/my-orders", authenticateToken, authorizeRoles("student"), getMyOrders);
router.post("/orders", authenticateToken, authorizeRoles("student"), createOrderWithBilling);

router.put("/orders/:id/refund-request", authenticateToken, authorizeRoles("student"), createRefundRequest);

router.post("/paytr/callback", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { merchant_oid, status, total_amount, hash } = req.body;

    const hashStr = `${merchant_oid}${process.env.PAYTR_MERCHANT_SALT}${status}${total_amount}`;
    const expectedHash = crypto.createHmac("sha256", process.env.PAYTR_MERCHANT_KEY)
      .update(hashStr)
      .digest("base64");

    if (expectedHash !== hash) {
      console.warn("❌ PayTR hash doğrulama başarısız");
      return res.status(403).send("INVALID HASH");
    }

    const order = await prisma.order.findFirst({
      where: { merchantOid: merchant_oid },
    });

    if (!order) {
      return res.status(404).send("ORDER NOT FOUND");
    }

    if (order.status === "paid") {
      return res.send("ALREADY PROCESSED");
    }

    if (status === "success") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "paid" },
      });
      console.log(`✅ Ödeme başarılı: Order #${order.id}`);
    } else {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "failed" },
      });
      console.log(`⚠️ Ödeme başarısız: Order #${order.id}`);
    }

    res.send("OK");
  } catch (error) {
    console.error("⚠️ PayTR callback hatası:", error.message);
    res.status(500).send("SERVER ERROR");
  }
});
export default router;
