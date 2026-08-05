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

export const getUserIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.connection?.remoteAddress ||
  "127.0.0.1";