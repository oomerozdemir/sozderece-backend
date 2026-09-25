import cron from "node-cron";
import prisma from "../utils/prisma.js";

const TZ = "Europe/Istanbul";

// Günlük çalışır: 24 saatten eski AiUsageLog satırlarındaki resultJson'ı
// temizler. Satırın kendisi (id, status, model, token/maliyet, reviewStatus)
// KALIR — bu tablonun kalıcı amacı maliyet/operasyon logu, resultJson
// yalnızca kısa vadeli idempotency cache'i (bkz. coach.controller.js#parseStudyPlanImage).
cron.schedule(
  "30 3 * * *",
  async () => {
    console.log("🕒 AiUsageLog resultJson prune başladı");
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await prisma.aiUsageLog.updateMany({
        where: { createdAt: { lt: cutoff }, resultJson: { not: null } },
        data: { resultJson: null },
      });
      console.log(`✅ AiUsageLog resultJson prune tamamlandı: ${result.count} satır temizlendi`);
    } catch (err) {
      console.error("AiUsageLog resultJson prune hatası:", err);
    }
  },
  { timezone: TZ }
);
