import { toDayStart } from "./istanbulTime.js";
import prisma from "./prisma.js";

// İki ayrı günlük limit (D3):
// - DAILY_LIMIT: yalnızca başarıyla ÇÖZÜLMÜŞ (status=COMPLETED) sorular düşer
//   — öğrenciye gösterilen "soru hakkı".
// - MAX_DAILY_ATTEMPTS: Claude'a giden HER gerçek vision çağrısı (sonuç ne
//   olursa olsun — COMPLETED, MULTIPLE_QUESTIONS, UNREADABLE, NOT_A_QUESTION)
//   bu tavana sayılır; maliyet güvenlik sınırı. Duplicate/cache hit (hiç
//   Claude'a gidilmez) ve ERROR (Anthropic API'nin kendi reddi — tipik
//   olarak token üretilmez) bu sayaca dahil değildir.
export const DAILY_LIMIT = Number(process.env.AI_QUESTION_DAILY_LIMIT || 10);
export const MAX_DAILY_ATTEMPTS = Number(process.env.AI_QUESTION_MAX_ATTEMPTS || 15);
export const MAX_FOLLOWUPS = Number(process.env.AI_QUESTION_MAX_FOLLOWUPS || 3);

const PROCESSING_STALE_MS = 3 * 60 * 1000; // Anthropic client timeout 55sn; 3dk sonra "hayalet" PROCESSING sayılır
const NON_SOLVED_ATTEMPT_STATUSES = ["MULTIPLE_QUESTIONS", "UNREADABLE", "NOT_A_QUESTION"];

export class QuotaError extends Error {
  constructor(kind, usage) {
    super(kind === "DAILY_LIMIT" ? "Bugünkü soru hakkını kullandın." : "Bugünkü deneme hakkını kullandın.");
    this.kind = kind; // "DAILY_LIMIT" | "ATTEMPT_LIMIT"
    this.usage = usage;
  }
}

async function snapshot(tx, studentId) {
  const dayStart = toDayStart(new Date());
  const freshProcessingWhere = {
    studentId,
    status: "PROCESSING",
    createdAt: { gte: new Date(Date.now() - PROCESSING_STALE_MS) },
  };
  const [solvedToday, nonSolvedAttemptsToday, reservedToday] = await Promise.all([
    tx.aiQuestion.count({ where: { studentId, status: "COMPLETED", createdAt: { gte: dayStart } } }),
    tx.aiQuestion.count({ where: { studentId, status: { in: NON_SOLVED_ATTEMPT_STATUSES }, createdAt: { gte: dayStart } } }),
    tx.aiQuestion.count({ where: freshProcessingWhere }),
  ]);
  return { solvedToday, nonSolvedAttemptsToday, reservedToday };
}

// UI'ya dönen özet — yalnızca çözülmüş soru sayısını yansıtır (D4). Bir
// rezervasyonun (PROCESSING) henüz sonucu belli olmadığı için öğrenciye
// gösterilmez; yarış-güvenliği yalnızca reserveAttempt içinde dahili olarak
// kullanılır.
export async function getUsageForDisplay(studentId) {
  const { solvedToday } = await snapshot(prisma, studentId);
  return { usedToday: solvedToday, remaining: Math.max(0, DAILY_LIMIT - solvedToday), dailyLimit: DAILY_LIMIT };
}

// Advisory lock + iki ayrı limit kontrolü + PROCESSING satırı oluşturma —
// hepsi tek bir transaction'da, aynı öğrencinin eşzamanlı istekleri
// serileştirilir (farklı öğrenciler birbirini hiç etkilemez).
export async function reserveAttempt(studentId, imageHash) {
  const dayKeyInt = Math.floor(toDayStart(new Date()).getTime() / 86400000);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentId}::int, ${dayKeyInt}::int)`;
    const { solvedToday, nonSolvedAttemptsToday, reservedToday } = await snapshot(tx, studentId);
    const usage = { usedToday: solvedToday, remaining: Math.max(0, DAILY_LIMIT - solvedToday), dailyLimit: DAILY_LIMIT };

    if (solvedToday + reservedToday >= DAILY_LIMIT) {
      throw new QuotaError("DAILY_LIMIT", usage);
    }
    if (solvedToday + nonSolvedAttemptsToday + reservedToday >= MAX_DAILY_ATTEMPTS) {
      throw new QuotaError("ATTEMPT_LIMIT", usage);
    }
    return tx.aiQuestion.create({ data: { studentId, imageHash, status: "PROCESSING" } });
  });
}

// R3 — doğrulama (verification) için AYRI günlük limit, ana 10-soru
// kotasından tamamen bağımsız. Yalnızca YENİ verification üretimi (generate)
// bu sayacı tüketir; mevcut bir verification'a cevap vermek (answer) hiçbir
// hak tüketmez (o yüzden bu sayaç yalnızca AiQuestionVerification.createdAt
// üzerinden sayar, evaluationStatus'tan bağımsız).
export const VERIFICATION_DAILY_LIMIT = Number(process.env.AI_VERIFICATION_DAILY_LIMIT || 5);

export class VerificationQuotaError extends Error {
  constructor(usage) {
    super("Bugünkü doğrulama hakkını kullandın.");
    this.kind = "VERIFICATION_DAILY_LIMIT";
    this.usage = usage;
  }
}

// R4 — bir soru için aynı anda yalnızca tek cevaplanmamış verification
// olması DB seviyesinde garanti edilir (bkz. migration'daki partial unique
// index AiQuestionVerification_questionId_unanswered_key). Bu fonksiyon
// yalnızca günlük limiti kontrol eder; unique-violation (P2002) durumunda
// caller (controller) var olan cevapsız kaydı bulup döner — bu fonksiyonun
// sorumluluğu değil.
export async function reserveVerificationGeneration(studentId, questionId) {
  const dayKeyInt = Math.floor(toDayStart(new Date()).getTime() / 86400000);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentId}::int, ${dayKeyInt}::int)`;
    const dayStart = toDayStart(new Date());
    const generatedToday = await tx.aiQuestionVerification.count({ where: { studentId, createdAt: { gte: dayStart } } });
    const usage = { usedToday: generatedToday, remaining: Math.max(0, VERIFICATION_DAILY_LIMIT - generatedToday), dailyLimit: VERIFICATION_DAILY_LIMIT };
    if (generatedToday >= VERIFICATION_DAILY_LIMIT) {
      throw new VerificationQuotaError(usage);
    }
    return tx.aiQuestionVerification.create({ data: { questionId, studentId, status: "PROCESSING" } });
  });
}

// Follow-up rezervasyonu — questionId bazlı advisory lock (farklı sorular
// birbirini etkilemez). Canlı (COMPLETED + yakın-PROCESSING) sayım
// MAX_FOLLOWUPS'tan azsa yeni bir PROCESSING AiQuestionFollowup satırı
// oluşturur. followupCount kolonuna değil, bu canlı sayıma güvenilir (D7).
export async function reserveFollowup(questionId, type, stepIndex) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${questionId}::int, 1::int)`; // 2. parametre: AiQuestion kilidinden (0) ayrışsın diye
    const activeCount = await tx.aiQuestionFollowup.count({
      where: {
        questionId,
        OR: [
          { status: "COMPLETED" },
          { status: "PROCESSING", createdAt: { gte: new Date(Date.now() - PROCESSING_STALE_MS) } },
        ],
      },
    });
    if (activeCount >= MAX_FOLLOWUPS) {
      const err = new Error("Bu soru için follow-up hakkın doldu.");
      err.code = "FOLLOWUP_LIMIT";
      throw err;
    }
    return tx.aiQuestionFollowup.create({ data: { questionId, type, stepIndex: stepIndex ?? null, status: "PROCESSING" } });
  });
}
