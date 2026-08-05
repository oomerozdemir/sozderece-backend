import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import allRoutes from "./routes/index.js";
import "./cron/abondonedCart.js";
import "./cron/subscriptionBilling.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

/* Proxy arkasında gerçek IP/cookie için önerilir (Render/CF/Nginx vb.) */
app.set("trust proxy", 1);

/* CORS: credentials için origin whitelist şart */
const allowedOrigins = [
  "https://sozderecekocluk.com",
  "https://www.sozderecekocluk.com",
];

app.use(cors({
  origin: (origin, cb) => {
    // Postman/curl gibi origin'siz istekleri kabul et
    if (!origin) return cb(null, true);
    return cb(null, allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],

}));
/* Body parsers — 50kb üzeri payload reddedilir (DoS / memory bomb koruması) */
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ limit: "50kb", extended: true }));

/* COOKIE PARSER MUTLAKA ROUTE'LARDAN ÖNCE OLMALI */
app.use(cookieParser());

/* Statik ve health */
app.get("/", (req, res) => res.send("🚀 API çalışıyor!"));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/* API Routes (/api/...) */
app.use("/api", allRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});

export default app;
