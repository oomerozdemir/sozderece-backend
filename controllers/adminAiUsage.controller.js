import prisma from "../utils/prisma.js";

/**
 * GET /api/admin/ai-usage/summary?month=YYYY-MM
 * Koç panelindeki AI görsel/PDF okuma özelliğinin bir aylık maliyet/operasyon
 * özeti. Varsayılan: içinde bulunulan ay (sunucu tarihine göre).
 */
export const getAiUsageSummary = async (req, res) => {
  try {
    const now = new Date();
    let year = now.getFullYear();
    let monthIndex = now.getMonth(); // 0-11

    if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
      const [y, m] = req.query.month.split("-").map(Number);
      year = y;
      monthIndex = m - 1;
    }

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);
    const monthLabel = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    const rows = await prisma.aiUsageLog.findMany({
      where: { feature: "study_plan_image", createdAt: { gte: monthStart, lt: monthEnd } },
      select: { status: true, reviewStatus: true, estimatedCostUsd: true },
    });

    const totalCount = rows.length;
    const readyCount = rows.filter((r) => r.status === "success" && r.reviewStatus === "ready").length;
    const needsReviewOrErrorCount = rows.filter((r) => r.status === "error" || r.reviewStatus === "needs_review").length;
    const knownCostRows = rows.filter((r) => r.estimatedCostUsd != null);
    const costUnknownCount = totalCount - knownCostRows.length;
    const totalCostUsd = knownCostRows.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
    const avgCostPerProgram = knownCostRows.length > 0 ? totalCostUsd / knownCostRows.length : null;

    res.json({
      success: true,
      month: monthLabel,
      stats: {
        totalCount,
        readyCount,
        needsReviewOrErrorCount,
        totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
        avgCostPerProgram: avgCostPerProgram != null ? Math.round(avgCostPerProgram * 1_000_000) / 1_000_000 : null,
        costUnknownCount,
      },
    });
  } catch (error) {
    console.error("getAiUsageSummary:", error);
    res.status(500).json({ success: false, message: "AI kullanım özeti alınamadı." });
  }
};
