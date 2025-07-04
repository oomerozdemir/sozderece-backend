import express from "express";
import { PrismaClient } from "@prisma/client";
import { getAssignedStudents, getAllPublicCoaches} from "../../controllers/coach.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";

const prisma = new PrismaClient();
const router = express.Router();

// Public: Öğrenciler için koçları getir
router.get("/my-students", authenticateToken, authorizeRoles("coach"), getAssignedStudents);
router.get("/public-coach", getAllPublicCoaches);


export default router;
