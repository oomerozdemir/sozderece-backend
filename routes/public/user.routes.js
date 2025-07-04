// 📁 routes/user.routes.js
import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";


const router = express.Router();
const prisma = new PrismaClient();

// GET /api/users - Sadece admin
router.get("/", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Kullanıcılar getirilemedi." });
  }
});

// GET /api/users/:id - Sadece admin
router.get("/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Kullanıcı getirilemedi." });
  }
});

// POST /api/users - Sadece admin
router.post("/", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const user = await prisma.user.create({
      data: { name, email, password, role },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Kullanıcı oluşturulamadı." });
  }
});

// PUT /api/users/:id - Sadece admin
router.put("/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, role } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { name, email, password, role },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Kullanıcı güncellenemedi." });
  }
});

// DELETE /api/users/:id - Sadece admin
router.delete("/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Kullanıcı silinemedi." });
  }
});




export default router;
