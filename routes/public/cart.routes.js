import express from "express";
import { addToCart, getCart,  } from "../controllers/cart.controller.js";
import { authenticateToken } from "../../middleware/authMiddleware.js"; 

const router = express.Router();

router.post("/cart/items", addToCart);
router.get("/cart", getCart);

export default router;
