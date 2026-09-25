// Model başına USD/milyon-token fiyatları. Kaynak: claude.com/pricing
// (resmi Anthropic fiyatlandırma sayfası), doğrulama tarihi: 2026-09-25.
// Buraya tahmini/placeholder bir rakam EKLENMEZ — bir model burada yoksa
// estimateCostUsd() null döner, sessizce yanlış bir maliyet üretmez.
export const MODEL_PRICING_USD_PER_MTOK = {
  "claude-sonnet-5": { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2 },
};

export function estimateCostUsd(model, usage) {
  const pricing = MODEL_PRICING_USD_PER_MTOK[model];
  if (!pricing || !usage) {
    if (!pricing) console.warn(`aiPricing: "${model}" için fiyat tanımlı değil, maliyet null döndürülüyor.`);
    return null;
  }
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;

  const cost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheWriteTokens / 1_000_000) * pricing.cacheWrite +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead;

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 ondalık basamağa yuvarla
}
