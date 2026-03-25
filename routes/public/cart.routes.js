import express from "express";
import { addToCart, getCart,updateItemQuantity,removeItem  } from "../../controllers/cart.controller.js";
import { optionalAuth } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/cart/items", optionalAuth, addToCart);
router.get("/cart", optionalAuth, getCart);
router.patch("/cart/items", optionalAuth, updateItemQuantity);
router.delete("/cart/items/:slug", optionalAuth, removeItem);

export default router;
