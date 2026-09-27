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
 * sunucuda yeniden hesaplar. Her satırın "net" alanı da burada yeniden
 * yazılır — client'ın gönderdiği net değerine hiçbir zaman güvenilmez.
 * @param {Array<{subject, questionCount, correct, wrong, blank}>} subjectNets
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
    const blank = Number(row.blank) || 0;
    const net = computeSubjectNet(correct, wrong, divisor);
    totalCorrect += correct;
    totalWrong += wrong;
    totalBlank += blank;
    totalNet += net;
    return {
      subject: row.subject,
      questionCount: row.questionCount != null ? Number(row.questionCount) : null,
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
 * Ders bazlı sonuç payload'ını doğrular. İlk hatada { valid:false, message }
 * döner; geçerliyse { valid:true }.
 * @param {Array<{subject, questionCount, correct, wrong, blank}>} subjectNets
 * @param {number|null} totalQuestions - dolu ise satırların questionCount toplamıyla tutarlılığı da kontrol edilir
 */
export function validateExamResultPayload(subjectNets, totalQuestions) {
  if (!Array.isArray(subjectNets) || subjectNets.length === 0) {
    return { valid: false, message: "En az bir ders sonucu girilmeli." };
  }

  let questionCountSum = 0;
  let anyQuestionCountMissing = false;

  for (const row of subjectNets) {
    if (!row || typeof row.subject !== "string" || !row.subject.trim()) {
      return { valid: false, message: "Her satırda bir ders adı olmalı." };
    }
    const correct = Number(row.correct);
    const wrong = Number(row.wrong);
    const blank = Number(row.blank);
    if (!Number.isFinite(correct) || !Number.isFinite(wrong) || !Number.isFinite(blank)) {
      return { valid: false, message: `${row.subject}: doğru/yanlış/boş sayısal olmalı.` };
    }
    if (correct < 0 || wrong < 0 || blank < 0) {
      return { valid: false, message: `${row.subject}: doğru/yanlış/boş negatif olamaz.` };
    }
    const questionCount = row.questionCount != null ? Number(row.questionCount) : null;
    if (questionCount != null) {
      if (!Number.isFinite(questionCount) || questionCount < 0) {
        return { valid: false, message: `${row.subject}: soru sayısı geçersiz.` };
      }
      if (correct + wrong + blank !== questionCount) {
        return { valid: false, message: `${row.subject}: doğru+yanlış+boş (${correct + wrong + blank}) soru sayısıyla (${questionCount}) uyuşmuyor.` };
      }
      questionCountSum += questionCount;
    } else {
      anyQuestionCountMissing = true;
    }
  }

  if (totalQuestions != null && !anyQuestionCountMissing && questionCountSum !== Number(totalQuestions)) {
    return { valid: false, message: `Ders bazlı soru sayıları toplamı (${questionCountSum}), toplam soru sayısıyla (${totalQuestions}) uyuşmuyor.` };
  }

  return { valid: true };
}
