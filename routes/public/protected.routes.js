import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", authenticateToken, (req, res) => {
  const { role } = req.user;

  let dashboardMessage = "";

  if (role === "admin") dashboardMessage = "Admin paneline hoş geldiniz.";
  else if (role === "coach") dashboardMessage = "Koç paneline hoş geldiniz.";
  else if (role === "student") dashboardMessage = "Öğrenci paneline hoş geldiniz.";

  res.json({
    success: true,
    message: dashboardMessage,
    user: req.user
  });
});

export default router;
