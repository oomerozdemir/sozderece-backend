import express from "express";
import { getAllUsers } from "../../controllers/adminController.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateToken, authorizeRoles("admin"), getAllUsers);



export default router;
