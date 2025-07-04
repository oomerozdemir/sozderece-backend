import express from "express";
import { getMyOrders, createOrderWithBilling, createRefundRequest } from "../../controllers/order.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/my-orders", authenticateToken, getMyOrders);
router.post("/orders", authenticateToken, authorizeRoles("student"), createOrderWithBilling);

router.put("/orders/:id/refund-request", authenticateToken, authorizeRoles("student"), createRefundRequest);


export default router;
