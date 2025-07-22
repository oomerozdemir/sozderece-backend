export const cleanMerchantOid = (id) =>
  id?.toString().replace(/[^a-zA-Z0-9]/g, "") || "";

export const cleanPrice = (priceStr) => {
  const cleaned = priceStr.toString().replace(/[^\d,.-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

export const requireFields = (fields) => {
  for (const [key, value] of Object.entries(fields)) {
    if (!value) return `Eksik alan: ${key}`;
  }
  return null;
};