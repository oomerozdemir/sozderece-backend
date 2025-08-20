import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import allRoutes from "./routes/index.js"; // 👈 tek yerden tüm route'lar
import path from "path";
import "./cron/abandonedCart.js";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "https://sozderecekocluk.com", // Vercel'deki frontend URL
  credentials: true
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 API çalışıyor!");
});

app.use("/api", allRoutes); // 👈 hepsini /api altında toplar
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));



app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});

export default app;
