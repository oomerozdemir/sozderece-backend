import express from "express";
import { addToCart, getCart,updateItemQuantity,removeItem  } from "../../controllers/cart.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/cart/items", authenticateToken, addToCart);
router.get("/cart",authenticateToken, getCart);
router.patch("/cart/items", authenticateToken, updateItemQuantity);
router.delete("/cart/items/:slug", authenticateToken, removeItem);

export default router;
