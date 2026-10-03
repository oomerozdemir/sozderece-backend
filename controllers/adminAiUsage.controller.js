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

/**
 * GET /api/admin/ai-usage/question-summary?month=YYYY-MM
 * AI Soru Asistanı'nın bir aylık maliyet/operasyon özeti. getAiUsageSummary
 * ile aynı ay-seçim deseni, ayrı bir endpoint — AiQuestion/AiUsageLog
 * ("ai_question_assistant"+"ai_question_followup"+"ai_question_verification"
 * — V2, generate ve answer çağrılarının ikisi de bu tek feature adı altında
 * loglanıyor, bkz. aiQuestion.controller.js) verisinden derlenir.
 */
export const getAiQuestionUsageSummary = async (req, res) => {
  try {
    const now = new Date();
    let year = now.getFullYear();
    let monthIndex = now.getMonth();

    if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
      const [y, m] = req.query.month.split("-").map(Number);
      year = y;
      monthIndex = m - 1;
    }

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);
    const monthLabel = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [monthlyQuestions, todayCount, followupLogs, verificationLogs] = await Promise.all([
      prisma.aiQuestion.findMany({
        where: { createdAt: { gte: monthStart, lt: monthEnd } },
        select: { studentId: true, status: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true },
      }),
      prisma.aiQuestion.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.aiUsageLog.findMany({
        where: { feature: "ai_question_followup", createdAt: { gte: monthStart, lt: monthEnd } },
        select: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.aiUsageLog.findMany({
        where: { feature: "ai_question_verification", createdAt: { gte: monthStart, lt: monthEnd } },
        select: { estimatedCostUsd: true, inputTokens: true, outputTokens: true, status: true },
      }),
    ]);

    const totalAttempts = monthlyQuestions.length;
    const totalSolved = monthlyQuestions.filter((q) => q.status === "COMPLETED").length;
    const uniqueStudents = new Set(monthlyQuestions.map((q) => q.studentId)).size;

    const sumTokens = (rows, field) => rows.reduce((sum, r) => sum + (r[field] || 0), 0);
    const sumCost = (rows) => rows.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);

    const totalInputTokens = sumTokens(monthlyQuestions, "inputTokens") + sumTokens(followupLogs, "inputTokens") + sumTokens(verificationLogs, "inputTokens");
    const totalOutputTokens = sumTokens(monthlyQuestions, "outputTokens") + sumTokens(followupLogs, "outputTokens") + sumTokens(verificationLogs, "outputTokens");
    const totalCostUsd = sumCost(monthlyQuestions) + sumCost(followupLogs) + sumCost(verificationLogs);
    const avgCostPerStudent = uniqueStudents > 0 ? totalCostUsd / uniqueStudents : null;
    const avgQuestionsPerStudent = uniqueStudents > 0 ? totalAttempts / uniqueStudents : null;
    // Doğrulama (verification) ayrı görünür kalsın diye grand total'a karışmanın
    // yanı sıra kendi satırı da raporlanır (plan §16: "ayrı ayrı görülebilsin").
    const totalVerificationCalls = verificationLogs.length;
    const totalVerificationCostUsd = sumCost(verificationLogs);

    // Öğrenci dökümü — isim join'i için ayrı bir User sorgusu.
    const byStudent = new Map();
    for (const q of monthlyQuestions) {
      const row = byStudent.get(q.studentId) || { studentId: q.studentId, attempts: 0, solved: 0, costUsd: 0 };
      row.attempts += 1;
      if (q.status === "COMPLETED") row.solved += 1;
      row.costUsd += q.estimatedCostUsd || 0;
      byStudent.set(q.studentId, row);
    }
    const studentRows = [...byStudent.values()].sort((a, b) => b.attempts - a.attempts);
    const studentIds = studentRows.map((r) => r.studentId);
    const students = studentIds.length
      ? await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, email: true } })
      : [];
    const nameById = new Map(students.map((s) => [s.id, s.name || s.email]));
    const studentBreakdown = studentRows.map((r) => ({
      studentId: r.studentId,
      name: nameById.get(r.studentId) || `#${r.studentId}`,
      attempts: r.attempts,
      solved: r.solved,
      costUsd: Math.round(r.costUsd * 1_000_000) / 1_000_000,
    }));

    res.json({
      success: true,
      month: monthLabel,
      stats: {
        todayCount,
        totalAttempts,
        totalSolved,
        uniqueStudents,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
        avgCostPerStudent: avgCostPerStudent != null ? Math.round(avgCostPerStudent * 1_000_000) / 1_000_000 : null,
        avgQuestionsPerStudent: avgQuestionsPerStudent != null ? Math.round(avgQuestionsPerStudent * 10) / 10 : null,
        totalVerificationCalls,
        totalVerificationCostUsd: Math.round(totalVerificationCostUsd * 1_000_000) / 1_000_000,
      },
      studentBreakdown,
    });
  } catch (error) {
    console.error("getAiQuestionUsageSummary:", error);
    res.status(500).json({ success: false, message: "AI Soru Asistanı kullanım özeti alınamadı." });
  }
};
