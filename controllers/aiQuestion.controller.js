import crypto from "node:crypto";
import prisma from "../utils/prisma.js";
import { anthropic, mapAnthropicError } from "../utils/anthropicClient.js";
import { detectFileType } from "../utils/fileSignature.js";
import { estimateCostUsd } from "../utils/aiPricing.js";
import { uploadBufferToCloudinary } from "../helpers/cloudinaryUpload.js";
import {
  AI_QUESTION_SYSTEM_PROMPT,
  AI_QUESTION_IMAGE_PROMPT,
  AI_QUESTION_TOOL,
  AI_QUESTION_FOLLOWUP_TOOL,
  buildFollowupMessages,
} from "../utils/aiQuestionPrompt.js";
import { getUsageForDisplay, reserveAttempt, reserveFollowup, QuotaError, MAX_FOLLOWUPS } from "../utils/aiQuestionQuota.js";

const DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün — aynı soru fotoğrafının anlamı zamanla değişmez, ama makul bir pencere
const FOLLOWUP_TYPES = ["EXPLAIN_SIMPLER", "EXPLAIN_STEP", "SIMILAR_EXAMPLE"];

const VALID_SOLUTION_STATUSES = ["SOLVED", "MULTIPLE_QUESTIONS", "UNREADABLE", "NOT_A_QUESTION"];
// D6: Claude'un döndürdüğü enum DB status'una birebir eşlenir — NOT_A_QUESTION
// artık INVALID_IMAGE'a karıştırılmıyor; INVALID_IMAGE yalnızca bizim kendi
// dosya-doğrulama katmanımızın (detectFileType reddi) ürettiği bir durum.
const SOLUTION_STATUS_TO_DB = {
  SOLVED: "COMPLETED",
  MULTIPLE_QUESTIONS: "MULTIPLE_QUESTIONS",
  UNREADABLE: "UNREADABLE",
  NOT_A_QUESTION: "NOT_A_QUESTION",
};

function sanitizeText(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

// Claude çıktısına güvenilmez — tip/uzunluk/enum kontrolünden geçirir.
// Şema dışı/eksik bir status gelirse (malformed tool-use) güvenli şekilde
// ERROR'a düşürülür, 500 patlamaz.
function sanitizeQuestionResult(raw) {
  const rawStatus = typeof raw?.status === "string" ? raw.status : null;
  if (!rawStatus || !VALID_SOLUTION_STATUSES.includes(rawStatus)) {
    return { dbStatus: "ERROR", fields: {} };
  }
  const dbStatus = SOLUTION_STATUS_TO_DB[rawStatus];
  const isSolved = rawStatus === "SOLVED";
  const steps = Array.isArray(raw.steps)
    ? raw.steps.filter((s) => typeof s === "string").map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 20)
    : [];
  return {
    dbStatus,
    fields: {
      subject: sanitizeText(raw.subject, 100),
      topic: sanitizeText(raw.topic, 150),
      questionSummary: sanitizeText(raw.questionSummary, 1000),
      concept: isSolved ? sanitizeText(raw.concept, 1000) : null,
      steps: isSolved ? steps : [],
      answer: isSolved ? sanitizeText(raw.answer, 500) : null,
      option: isSolved ? sanitizeText(raw.option, 10) : null,
      tip: isSolved ? sanitizeText(raw.tip, 500) : null,
    },
  };
}

function sanitizeFollowupText(raw) {
  return sanitizeText(raw?.responseText, 2000);
}

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Görsel indirilemedi (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("base64");
}

/**
 * GET /api/v1/ogrenci/me/ai-question/usage
 */
export const getAiQuestionUsage = async (req, res) => {
  try {
    const usage = await getUsageForDisplay(req.user.id);
    res.json({ success: true, ...usage });
  } catch (error) {
    console.error("getAiQuestionUsage:", error);
    res.status(500).json({ success: false, message: "Kullanım bilgisi alınamadı." });
  }
};

/**
 * POST /api/v1/ogrenci/me/ai-question
 * multipart/form-data, alan adı "image".
 * Akış: dosya doğrula -> hash -> duplicate kontrolü (D2) -> kota/attempt
 * rezervasyonu (D3/D4/D5) -> Cloudinary (D1) -> Claude -> sanitize -> kaydet.
 */
export const createAiQuestion = async (req, res) => {
  const studentId = req.user.id;
  try {
    if (!anthropic) {
      return res.status(503).json({ success: false, message: "Bu özellik şu anda yapılandırılmamış." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Soru görseli zorunludur." });
    }

    // Client'ın form-data'da beyan ettiği mimetype güvenilir değil — gerçek
    // dosya tipi magic-byte imzasından doğrulanır. INVALID_IMAGE burada
    // set edilir, Claude'a hiç gidilmez (D6), DB satırı hiç oluşmaz.
    const detectedType = detectFileType(req.file.buffer);
    if (!detectedType || !detectedType.startsWith("image/")) {
      return res.status(422).json({ success: false, message: "Dosya türü tanınamadı, lütfen PNG/JPEG/WEBP görsel yükleyin." });
    }

    const imageHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    // D2: duplicate kontrolü HER ŞEYDEN önce — kota dolmuş olsa bile daha
    // önce çözülmüş aynı soru görüntülenebilmeli, hiçbir sayaca dokunmaz.
    const cached = await prisma.aiQuestion.findFirst({
      where: {
        studentId,
        imageHash,
        status: "COMPLETED",
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      include: { followups: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      const usage = await getUsageForDisplay(studentId);
      return res.json({ success: true, question: cached, usage, cached: true });
    }

    let reserved;
    try {
      reserved = await reserveAttempt(studentId, imageHash);
    } catch (err) {
      if (err instanceof QuotaError) {
        return res.status(429).json({ success: false, message: err.message, code: err.kind, usage: err.usage });
      }
      throw err;
    }

    const model = process.env.ANTHROPIC_QUESTION_MODEL || "claude-sonnet-5";

    // D1: orijinal Cloudinary'de saklanır (gösterim için), eager transform
    // ile üretilen boyut-sınırlı webp kopyası Claude'a gönderilir (token israfını önler).
    let uploadResult;
    try {
      uploadResult = await uploadBufferToCloudinary(req.file.buffer, `ai-question-${studentId}`, "ai-questions", {
        eager: [{ width: 1568, crop: "limit", fetch_format: "webp", quality: "auto" }],
      });
    } catch (uploadErr) {
      console.error("createAiQuestion (Cloudinary):", uploadErr);
      await prisma.aiQuestion.update({ where: { id: reserved.id }, data: { status: "ERROR" } }).catch(() => {});
      const usage = await getUsageForDisplay(studentId);
      return res.status(503).json({ success: false, message: "Görsel yüklenemedi, lütfen tekrar deneyin.", usage });
    }

    const claudeImageUrl = uploadResult.eager?.[0]?.secure_url || uploadResult.secure_url;
    let claudeImageBase64;
    try {
      claudeImageBase64 = await fetchAsBase64(claudeImageUrl);
    } catch (fetchErr) {
      console.error("createAiQuestion (eager fetch):", fetchErr);
      await prisma.aiQuestion.update({ where: { id: reserved.id }, data: { status: "ERROR", imageUrl: uploadResult.secure_url } }).catch(() => {});
      const usage = await getUsageForDisplay(studentId);
      return res.status(503).json({ success: false, message: "Görsel işlenemedi, lütfen tekrar deneyin.", usage });
    }

    let message;
    try {
      message = await anthropic.messages.create({
        model,
        max_tokens: 2000,
        system: AI_QUESTION_SYSTEM_PROMPT,
        tools: [AI_QUESTION_TOOL],
        tool_choice: { type: "tool", name: "submit_question_solution" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/webp", data: claudeImageBase64 } },
              { type: "text", text: AI_QUESTION_IMAGE_PROMPT },
            ],
          },
        ],
      });
    } catch (apiErr) {
      const mapped = mapAnthropicError(apiErr);
      console.error("createAiQuestion (Anthropic API):", apiErr);
      await prisma.aiQuestion.update({ where: { id: reserved.id }, data: { status: "ERROR", imageUrl: uploadResult.secure_url } }).catch(() => {});
      await prisma.aiUsageLog
        .create({ data: { feature: "ai_question_assistant", studentId, model, status: "error", errorCode: mapped.code, fileHash: imageHash, fileMimeType: detectedType } })
        .catch((e) => console.error("AiUsageLog yazılamadı:", e));
      const usage = await getUsageForDisplay(studentId);
      return res.status(mapped.status).json({ success: false, message: mapped.message, usage });
    }

    const toolUse = message.content?.find((b) => b.type === "tool_use" && b.name === "submit_question_solution");
    const { dbStatus, fields } = sanitizeQuestionResult(toolUse?.input);
    const estimatedCostUsd = estimateCostUsd(model, message.usage);

    const updated = await prisma.aiQuestion.update({
      where: { id: reserved.id },
      data: {
        ...fields,
        status: dbStatus,
        imageUrl: uploadResult.secure_url,
        model,
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
        estimatedCostUsd,
      },
    });

    await prisma.aiUsageLog
      .create({
        data: {
          feature: "ai_question_assistant",
          studentId,
          model,
          status: "success",
          inputTokens: message.usage?.input_tokens ?? null,
          outputTokens: message.usage?.output_tokens ?? null,
          estimatedCostUsd,
          fileHash: imageHash,
          fileMimeType: detectedType,
        },
      })
      .catch((e) => console.error("AiUsageLog yazılamadı:", e));

    const usage = await getUsageForDisplay(studentId);
    res.json({ success: true, question: { ...updated, followups: [] }, usage });
  } catch (error) {
    console.error("createAiQuestion:", error);
    res.status(500).json({ success: false, message: "Soru işlenemedi, lütfen tekrar deneyin." });
  }
};

/**
 * GET /api/v1/ogrenci/me/ai-question/history
 */
export const getAiQuestionHistory = async (req, res) => {
  try {
    const questions = await prisma.aiQuestion.findMany({
      where: { studentId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ success: true, questions });
  } catch (error) {
    console.error("getAiQuestionHistory:", error);
    res.status(500).json({ success: false, message: "Geçmiş alınamadı." });
  }
};

/**
 * GET /api/v1/ogrenci/me/ai-question/:id
 */
export const getAiQuestionDetail = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const question = await prisma.aiQuestion.findUnique({
      where: { id },
      include: { followups: { orderBy: { createdAt: "asc" } } },
    });
    if (!question || question.studentId !== req.user.id) {
      return res.status(404).json({ success: false, message: "Soru bulunamadı." });
    }
    res.json({ success: true, question });
  } catch (error) {
    console.error("getAiQuestionDetail:", error);
    res.status(500).json({ success: false, message: "Soru alınamadı." });
  }
};

/**
 * POST /api/v1/ogrenci/me/ai-question/:id/followup
 * Body: { type: "EXPLAIN_SIMPLER"|"EXPLAIN_STEP"|"SIMILAR_EXAMPLE", stepIndex?: number }
 * D7: follow-up hakkı Claude'dan ÖNCE kalıcı olarak düşmez — PROCESSING ->
 * COMPLETED (başarı, followupCount++) | ERROR (hak tüketilmez).
 */
export const createFollowup = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { type } = req.body || {};
    const stepIndex = Number.isInteger(req.body?.stepIndex) ? req.body.stepIndex : null;

    if (!FOLLOWUP_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Geçersiz follow-up türü." });
    }

    const question = await prisma.aiQuestion.findUnique({ where: { id } });
    if (!question || question.studentId !== req.user.id) {
      return res.status(404).json({ success: false, message: "Soru bulunamadı." });
    }
    if (question.status !== "COMPLETED") {
      return res.status(400).json({ success: false, message: "Bu soru için follow-up yalnızca çözülmüş bir sorudan istenebilir." });
    }
    if (type === "EXPLAIN_STEP") {
      const steps = Array.isArray(question.steps) ? question.steps : [];
      if (stepIndex === null || stepIndex < 0 || stepIndex >= steps.length) {
        return res.status(400).json({ success: false, message: "Geçersiz adım." });
      }
    }

    let followupRow;
    try {
      followupRow = await reserveFollowup(id, type, type === "EXPLAIN_STEP" ? stepIndex : null);
    } catch (err) {
      if (err.code === "FOLLOWUP_LIMIT") {
        return res.status(400).json({ success: false, message: `Bu soru için en fazla ${MAX_FOLLOWUPS} follow-up hakkın var, doldu.` });
      }
      throw err;
    }

    if (!anthropic) {
      await prisma.aiQuestionFollowup.update({ where: { id: followupRow.id }, data: { status: "ERROR" } });
      return res.status(503).json({ success: false, message: "Bu özellik şu anda yapılandırılmamış." });
    }

    const model = process.env.ANTHROPIC_QUESTION_MODEL || "claude-sonnet-5";
    let message;
    try {
      message = await anthropic.messages.create({
        model,
        max_tokens: 1200,
        system: AI_QUESTION_SYSTEM_PROMPT,
        tools: [AI_QUESTION_FOLLOWUP_TOOL],
        tool_choice: { type: "tool", name: "submit_followup_response" },
        messages: buildFollowupMessages(question, type, stepIndex),
      });
    } catch (apiErr) {
      const mapped = mapAnthropicError(apiErr);
      console.error("createFollowup (Anthropic API):", apiErr);
      await prisma.aiQuestionFollowup.update({ where: { id: followupRow.id }, data: { status: "ERROR" } });
      await prisma.aiUsageLog
        .create({ data: { feature: "ai_question_followup", studentId: req.user.id, model, status: "error", errorCode: mapped.code } })
        .catch((e) => console.error("AiUsageLog yazılamadı:", e));
      return res.status(mapped.status).json({ success: false, message: mapped.message });
    }

    const toolUse = message.content?.find((b) => b.type === "tool_use" && b.name === "submit_followup_response");
    const responseText = sanitizeFollowupText(toolUse?.input);
    const estimatedCostUsd = estimateCostUsd(model, message.usage);

    if (!responseText) {
      // Malformed/boş çıktı — hak tüketilmez, satır ERROR'a düşer.
      await prisma.aiQuestionFollowup.update({ where: { id: followupRow.id }, data: { status: "ERROR", model } });
      return res.status(502).json({ success: false, message: "Açıklama üretilemedi, lütfen tekrar dene." });
    }

    const [updatedFollowup] = await prisma.$transaction([
      prisma.aiQuestionFollowup.update({
        where: { id: followupRow.id },
        data: {
          status: "COMPLETED",
          responseText,
          model,
          inputTokens: message.usage?.input_tokens ?? null,
          outputTokens: message.usage?.output_tokens ?? null,
          estimatedCostUsd,
        },
      }),
      prisma.aiQuestion.update({ where: { id }, data: { followupCount: { increment: 1 } } }),
    ]);

    await prisma.aiUsageLog
      .create({
        data: {
          feature: "ai_question_followup",
          studentId: req.user.id,
          model,
          status: "success",
          inputTokens: message.usage?.input_tokens ?? null,
          outputTokens: message.usage?.output_tokens ?? null,
          estimatedCostUsd,
        },
      })
      .catch((e) => console.error("AiUsageLog yazılamadı:", e));

    res.json({ success: true, followup: updatedFollowup });
  } catch (error) {
    console.error("createFollowup:", error);
    res.status(500).json({ success: false, message: "Follow-up işlenemedi, lütfen tekrar deneyin." });
  }
};
