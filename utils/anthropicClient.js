import Anthropic from "@anthropic-ai/sdk";

// Anahtar bir workspace'e bağlı değilse Anthropic API'si isteği reddediyor
// (400 invalid_request_error) — bu yüzden anthropic-workspace-id header'ı zorunlu.
// Önceden controllers/coach.controller.js içinde tanımlıydı; AI Soru Asistanı
// da aynı client'a ihtiyaç duyduğu için buraya taşındı (davranış birebir
// aynı) — coach.controller.js ve aiQuestion.controller.js ikisi de buradan
// import eder, iki ayrı Anthropic client kurulmaz.
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
        ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
        : undefined,
      timeout: 55_000,
      maxRetries: 2,
    })
  : null;

// Anthropic hatalarını öğrenciye/koça gösterilecek genel bir mesaja çevirir
// — ham hata metni asla doğrudan kullanıcıya dönmez ("AI hataları teknik
// hata mesajı olarak gösterilmesin" kuralı).
export function mapAnthropicError(err) {
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, code: "rate_limit", message: "Sistem şu anda yoğun, birkaç dakika sonra tekrar deneyin." };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, code: "timeout", message: "İşlem zaman aşımına uğradı, lütfen tekrar deneyin." };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, code: "config_error", message: "Bu özellik şu anda kullanılamıyor." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    // Bu spesifik 400, dosyayla ilgili değil — API anahtarı bir workspace'e
    // bağlı değilken anthropic-workspace-id header'ı eksikse Anthropic bunu
    // BadRequestError olarak döndürüyor (AuthenticationError değil). Yanlış
    // sınıflandırılırsa kullanıcı "dosya bozuk" sanır, asıl sorun ortam
    // değişkeni yapılandırmasıdır — bu yüzden ayrıca yakalanıp config_error'a çevrilir.
    const isWorkspaceConfigError = /workspace/i.test(err.error?.error?.message || err.message || "");
    if (isWorkspaceConfigError) {
      console.error("ANTHROPIC_WORKSPACE_ID eksik/yanlış yapılandırılmış olabilir.");
      return { status: 503, code: "config_error", message: "Bu özellik şu anda kullanılamıyor." };
    }
    return { status: 422, code: "invalid_input", message: "Yüklenen dosya okunamadı, farklı bir görsel deneyin." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, code: "api_error", message: "Servise şu anda ulaşılamıyor, lütfen daha sonra tekrar deneyin." };
  }
  return { status: 503, code: "api_error", message: "İşlem sırasında bir sorun oluştu, lütfen tekrar deneyin." };
}
