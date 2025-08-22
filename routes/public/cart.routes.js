import express from "express";
import { addToCart, getCart,  } from "../../controllers/cart.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/items", authenticateToken, addToCart);
router.get("/",authenticateToken, getCart);

export default router;
