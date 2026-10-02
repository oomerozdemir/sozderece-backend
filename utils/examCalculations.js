// Deneme Merkezi — net hesaplama + validation, tek yerden. Öğrenci-taraf
// yazma uçları (controllers/studentPanel.controller.js) bu dosyayı
// kullanır; mantık başka hiçbir yerde tekrarlanmaz.

export const EXAM_TYPES = ["TYT", "AYT", "LGS", "BRANS"];

// Türkiye sınav sistemi net formülü: 5 şıklı sınavlarda (TYT/AYT) yanlış/4,
// 4 şıklı LGS'de yanlış/3. BRANS bir alt-sınav pratiği olduğu için öğrencinin
// kendi track'ine (yks/lgs) göre belirlenir.
export function netDivisor(examType, studentTrack) {
  if (examType === "LGS") return 3;
  if (examType === "BRANS") return studentTrack === "lgs" ? 3 : 4;
  return 4; // TYT, AYT
}

// Negatif net matematiksel olarak geçerli bir sonuç (çok sayıda yanlış, az
// doğru) — sıfıra kırpılmıyor. Gerçek değer olduğu gibi korunur, kırpma
// yalnızca sunum katmanında bile yapılmaz.
export function computeSubjectNet(correct, wrong, divisor) {
  return correct - wrong / divisor;
}

/**
 * subjectNets[] satırlarından totalCorrect/totalWrong/totalBlank/totalNet'i
 * sunucuda yeniden hesaplar. Her satırın "blank" ve "net" alanı da burada
 * yeniden yazılır — client'ın gönderdiği blank/net değerine hiçbir zaman
 * güvenilmez (öğrenci yalnızca correct/wrong girer, blank = questionCount -
 * correct - wrong). validateExamResultPayload bu fonksiyondan önce çağrıldığı
 * için questionCount'un geçerli olduğu ve correct+wrong <= questionCount
 * olduğu garanti edilmiştir.
 * @param {Array<{subject, questionCount, correct, wrong}>} subjectNets
 * @param {string} examType
 * @param {string} studentTrack - "yks" | "lgs"
 * @returns {{ subjectNets: Array, totalCorrect: number, totalWrong: number, totalBlank: number, totalNet: number }}
 */
export function computeExamAggregates(subjectNets, examType, studentTrack) {
  const divisor = netDivisor(examType, studentTrack);
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalBlank = 0;
  let totalNet = 0;

  const recomputed = subjectNets.map((row) => {
    const correct = Number(row.correct) || 0;
    const wrong = Number(row.wrong) || 0;
    const questionCount = Number(row.questionCount) || 0;
    const blank = questionCount - correct - wrong;
    const net = computeSubjectNet(correct, wrong, divisor);
    totalCorrect += correct;
    totalWrong += wrong;
    totalBlank += blank;
    totalNet += net;
    return {
      subject: row.subject,
      questionCount,
      correct,
      wrong,
      blank,
      net,
      wrongTopicIds: Array.isArray(row.wrongTopicIds) ? row.wrongTopicIds : [],
    };
  });

  return { subjectNets: recomputed, totalCorrect, totalWrong, totalBlank, totalNet };
}

/**
 * Ders bazlı sonuç payload'ını doğrular. Öğrenci yalnızca correct/wrong
 * girer; blank artık client'tan hiç okunmaz/validate edilmez (gönderilse
 * bile computeExamAggregates onu yok sayıp yeniden hesaplar). İlk hatada
 * { valid:false, message } döner; geçerliyse { valid:true }.
 * @param {Array<{subject, questionCount, correct, wrong}>} subjectNets
 * @param {number|null} totalQuestions - dolu ise satırların questionCount toplamıyla tutarlılığı da kontrol edilir
 */
export function validateExamResultPayload(subjectNets, totalQuestions) {
  if (!Array.isArray(subjectNets) || subjectNets.length === 0) {
    return { valid: false, message: "En az bir ders sonucu girilmeli." };
  }

  let questionCountSum = 0;

  for (const row of subjectNets) {
    if (!row || typeof row.subject !== "string" || !row.subject.trim()) {
      return { valid: false, message: "Her satırda bir ders adı olmalı." };
    }
    const questionCount = Number(row.questionCount);
    if (row.questionCount == null || !Number.isFinite(questionCount) || questionCount < 0) {
      return { valid: false, message: `${row.subject}: soru sayısı girilmeli.` };
    }
    const correct = Number(row.correct);
    const wrong = Number(row.wrong);
    if (!Number.isFinite(correct) || !Number.isFinite(wrong)) {
      return { valid: false, message: `${row.subject}: doğru/yanlış sayısal olmalı.` };
    }
    if (correct < 0 || correct > questionCount) {
      return { valid: false, message: `${row.subject}: Doğru sayısı 0 ile ${questionCount} arasında olmalı.` };
    }
    if (wrong < 0 || wrong > questionCount) {
      return { valid: false, message: `${row.subject}: Yanlış sayısı 0 ile ${questionCount} arasında olmalı.` };
    }
    if (correct + wrong > questionCount) {
      return { valid: false, message: `${row.subject}: Doğru ve yanlış toplamı soru sayısını geçemez.` };
    }
    questionCountSum += questionCount;
  }

  if (totalQuestions != null && questionCountSum !== Number(totalQuestions)) {
    return { valid: false, message: `Ders bazlı soru sayıları toplamı (${questionCountSum}), toplam soru sayısıyla (${totalQuestions}) uyuşmuyor.` };
  }

  return { valid: true };
}
