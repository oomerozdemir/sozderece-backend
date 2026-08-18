import cron from "node-cron";
import prisma from "../utils/prisma.js";

const TZ = "Europe/Istanbul";
const RETENTION_DAYS = 180;

// Her gün 03:00'te (İstanbul saati), hiçbir siparişe/aboneliğe/ödeme
// girişimine bağlanmamış ve uzun süredir görünmeyen anonim ziyaretçi
// kayıtlarını temizler. VisitorSession'lar Visitor silinince cascade ile gider.
cron.schedule("0 3 * * *", async () => {
  console.log("🧹 Ziyaretçi oturumu temizleme cron'u başladı");
  try {
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const { count } = await prisma.visitor.deleteMany({
      where: {
        lastSeenAt: { lte: threshold },
        orders: { none: {} },
        paymentMetas: { none: {} },
        subscriptions: { none: {} },
      },
    });

    console.log(`🧹 ${count} eski ziyaretçi kaydı (siparişsiz) temizlendi.`);
  } catch (err) {
    console.error("❌ pruneVisitorSessions cron hatası:", err);
  }
}, { timezone: TZ });
