import express from "express";
import { getMyOrders, createOrderWithBilling, createRefundRequest } from "../../controllers/order.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/my-orders", authenticateToken, getMyOrders);
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

    const orderId = parseInt(merchant_oid.replace("ORDER_", ""));

    if (status === "success") {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "paid" },
      });

      console.log(`✅ Ödeme başarılı: Order #${orderId}`);
    } else {
      console.log(`⚠️ Ödeme başarısız: Order #${orderId}`);
    }

    res.send("OK");
  } catch (error) {
    console.error("⚠️ PayTR callback hatası:", error.message);
    res.status(500).send("SERVER ERROR");
  }
});

export default router;
