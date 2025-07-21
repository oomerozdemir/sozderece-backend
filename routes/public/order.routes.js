import express from "express";
import { getMyOrders, prepareOrder, createRefundRequest, handlePaytrCallback, initiatePaytrPayment } from "../../controllers/order.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/my-orders", authenticateToken, authorizeRoles("student"), getMyOrders);
// router.post("/orders", authenticateToken, createOrderWithBilling);
router.post("/orders/prepare", authenticateToken, prepareOrder);
router.post("/paytr/initiate", authenticateToken, initiatePaytrPayment);

router.put("/orders/:id/refund-request", authenticateToken, authorizeRoles("student"), createRefundRequest);
router.post("/orders/paytr/callback", express.urlencoded({ extended: false }), express.json(), handlePaytrCallback);



export default router;
