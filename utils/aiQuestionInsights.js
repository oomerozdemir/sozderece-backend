// AI Soru Asistanı V2 — öğrenme sinyali aggregation'ı. Tek source-of-truth:
// hem öğrenci ("Soru Profilim") hem koç ("AI Soru Asistanı İçgörüleri")
// endpoint'i bu dosyadaki buildQuestionInsights()'ı çağırır; yetkilendirme
// çağıran tarafta yapılır (bu dosya yalnızca studentId parametresiyle
// çalışır, başka öğrencinin verisi asla karışmaz).
//
// AI çağrısı YOK — tamamen deterministic SQL/JS aggregation. Mastery/
// confidence için ayrı bir tablo tutulmuyor, her istek anında hesaplanır.
import prisma from "./prisma.js";

// Claude'un ürettiği serbest metin alanlarında ("Matematik" vs "matematik."
// vs "Temel Matematik") sahte ayrı insight'lar oluşmaması için gruplama key'i
// normalize edilir; UI'da gösterilen label en son görülen ORİJİNAL string
// kalır. Liste küçük ve bilinçli tutuluyor — agresif/otomatik eşleştirme yok.
const ALIAS_MAP = {
  "temel matematik": "matematik",
  "turkce": "türkçe",
  "fen": "fen bilimleri",
};

export function normalizeKey(value) {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
  if (!key) return null;
  return ALIAS_MAP[key] || key;
}

const DEFAULT_PERIOD_DAYS = 30;
const MIN_OCCURRENCE_FOR_SIGNAL = 3; // K5 — 1-2 görülme learningSignals'a hiç girmez
const TOP_LIST_LIMIT = 10;

function countTrailingCorrect(sequence) {
  let count = 0;
  for (let i = sequence.length - 1; i >= 0; i--) {
    if (sequence[i] !== "CORRECT") break;
    count++;
  }
  return count;
}

/**
 * @param {number} studentId
 * @param {{days?: number}} opts
 * @returns {Promise<{periodDays:number, totalQuestions:number, topTopics:Array, topSkills:Array, learningSignals:Array, verificationSummary:object}>}
 */
export async function buildQuestionInsights(studentId, { days = DEFAULT_PERIOD_DAYS } = {}) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [questions, verifications] = await Promise.all([
    prisma.aiQuestion.findMany({
      where: { studentId, createdAt: { gte: cutoff }, status: { not: "PROCESSING" } },
      select: { status: true, subject: true, topic: true, skills: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aiQuestionVerification.findMany({
      where: { studentId, createdAt: { gte: cutoff } },
      select: { subject: true, topic: true, skills: true, evaluationStatus: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const totalQuestions = questions.length;
  // topTopics/topSkills/learningSignals yalnızca gerçekten çözülmüş (COMPLETED)
  // sorulardan türer — diğer statülerde skills zaten boş dizi (sanitizeQuestionResult).
  const solved = questions.filter((q) => q.status === "COMPLETED");

  const topicMap = new Map(); // "subjKey||topicKey" -> {subject, topic, count}
  const skillMap = new Map(); // skillKey -> {skill, count}
  const tripleMap = new Map(); // "subjKey||topicKey||skillKey" -> {subject, topic, skill, occurrenceCount}

  for (const q of solved) {
    const subjKey = normalizeKey(q.subject);
    const topicKey = normalizeKey(q.topic);
    if (subjKey && topicKey) {
      const key = `${subjKey}||${topicKey}`;
      const existing = topicMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.subject = q.subject;
        existing.topic = q.topic;
      } else {
        topicMap.set(key, { subject: q.subject, topic: q.topic, count: 1 });
      }
    }

    const skills = Array.isArray(q.skills) ? q.skills : [];
    for (const rawSkill of skills) {
      const skillKey = normalizeKey(rawSkill);
      if (!skillKey) continue;

      const existingSkill = skillMap.get(skillKey);
      if (existingSkill) {
        existingSkill.count += 1;
        existingSkill.skill = rawSkill;
      } else {
        skillMap.set(skillKey, { skill: rawSkill, count: 1 });
      }

      if (subjKey && topicKey) {
        const tripleKey = `${subjKey}||${topicKey}||${skillKey}`;
        const existingTriple = tripleMap.get(tripleKey);
        if (existingTriple) {
          existingTriple.occurrenceCount += 1;
          existingTriple.subject = q.subject;
          existingTriple.topic = q.topic;
          existingTriple.skill = rawSkill;
        } else {
          tripleMap.set(tripleKey, { subject: q.subject, topic: q.topic, skill: rawSkill, occurrenceCount: 1 });
        }
      }
    }
  }

  // Doğrulama dizileri, her (subject,topic,skill) üçlüsü için kronolojik
  // evaluationStatus listesi — VERIFIED_ONCE/IMPROVING state hesaplaması için.
  const verificationSeqByTriple = new Map();
  let totalCorrect = 0, totalIncorrect = 0, totalPartial = 0;
  for (const v of verifications) {
    if (!v.evaluationStatus) continue; // henüz cevaplanmamış, hiçbir sayıma girmez
    if (v.evaluationStatus === "CORRECT") totalCorrect += 1;
    else if (v.evaluationStatus === "INCORRECT") totalIncorrect += 1;
    else if (v.evaluationStatus === "PARTIAL") totalPartial += 1;

    const subjKey = normalizeKey(v.subject);
    const topicKey = normalizeKey(v.topic);
    const skills = Array.isArray(v.skills) ? v.skills : [];
    if (!subjKey || !topicKey || skills.length === 0) continue;
    for (const rawSkill of skills) {
      const skillKey = normalizeKey(rawSkill);
      if (!skillKey) continue;
      const tripleKey = `${subjKey}||${topicKey}||${skillKey}`;
      if (!verificationSeqByTriple.has(tripleKey)) verificationSeqByTriple.set(tripleKey, []);
      verificationSeqByTriple.get(tripleKey).push(v.evaluationStatus);
    }
  }

  // K5 deterministic kurallar — bkz. plan "Mimari Kararlar".
  const learningSignals = [];
  for (const [tripleKey, triple] of tripleMap.entries()) {
    if (triple.occurrenceCount < MIN_OCCURRENCE_FOR_SIGNAL) continue;

    const seq = verificationSeqByTriple.get(tripleKey) || [];
    const correct = seq.filter((s) => s === "CORRECT").length;
    const incorrect = seq.filter((s) => s === "INCORRECT").length;
    const partial = seq.filter((s) => s === "PARTIAL").length;

    let state = "NEEDS_PRACTICE";
    if (seq.length > 0 && seq[seq.length - 1] === "CORRECT") {
      const trailingCorrect = countTrailingCorrect(seq);
      const hasEarlierIncorrect = seq.slice(0, seq.length - trailingCorrect).includes("INCORRECT");
      state = trailingCorrect >= 2 && hasEarlierIncorrect ? "IMPROVING" : "VERIFIED_ONCE";
    }

    learningSignals.push({
      subject: triple.subject,
      topic: triple.topic,
      skill: triple.skill,
      occurrenceCount: triple.occurrenceCount, // R7 — state değişse de frekans kaybolmaz
      state,
      verificationSummary: { correct, incorrect, partial, total: seq.length },
    });
  }
  learningSignals.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  const topTopics = [...topicMap.values()].sort((a, b) => b.count - a.count).slice(0, TOP_LIST_LIMIT);
  const topSkills = [...skillMap.values()].sort((a, b) => b.count - a.count).slice(0, TOP_LIST_LIMIT);

  return {
    periodDays: days,
    totalQuestions,
    topTopics,
    topSkills,
    learningSignals,
    verificationSummary: {
      correct: totalCorrect,
      incorrect: totalIncorrect,
      partial: totalPartial,
      total: totalCorrect + totalIncorrect + totalPartial,
    },
  };
}

/**
 * FAZ 5 — follow-up kişiselleştirme (R1). Bir follow-up istendiğinde artık
 * sorunun subject/topic'i bellidir; öğrencinin AYNI (normalize edilmiş)
 * subject+topic'te K5 eşiğini (3+) geçmiş başka COMPLETED sorusu varsa kısa
 * bir repeat-signal döner, yoksa null — null ise hiçbir context eklenmez
 * (gürültü/yanlış kişiselleştirme riski alınmaz). Tüm-zaman bakılır (zaman
 * penceresi yok) — "bu konuda daha önce de zorlandı mı" sorusu bir rapor
 * periyoduna bağlı değildir.
 * @returns {Promise<{subject:string, topic:string, occurrenceCount:number, topSkills:Array<{skill:string,count:number}>}|null>}
 */
export async function getRepeatSignalForTopic(studentId, subject, topic) {
  const subjKey = normalizeKey(subject);
  const topicKey = normalizeKey(topic);
  if (!subjKey || !topicKey) return null;

  const questions = await prisma.aiQuestion.findMany({
    where: { studentId, status: "COMPLETED" },
    select: { subject: true, topic: true, skills: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const matching = questions.filter((q) => normalizeKey(q.subject) === subjKey && normalizeKey(q.topic) === topicKey);
  if (matching.length < MIN_OCCURRENCE_FOR_SIGNAL) return null;

  const skillCounts = new Map();
  for (const q of matching) {
    const skills = Array.isArray(q.skills) ? q.skills : [];
    for (const rawSkill of skills) {
      const skillKey = normalizeKey(rawSkill);
      if (!skillKey) continue;
      const existing = skillCounts.get(skillKey);
      if (existing) existing.count += 1;
      else skillCounts.set(skillKey, { skill: rawSkill, count: 1 });
    }
  }
  const topSkills = [...skillCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  return {
    subject: matching[0].subject,
    topic: matching[0].topic,
    occurrenceCount: matching.length,
    topSkills,
  };
}
