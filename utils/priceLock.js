import prisma from "./prisma.js";

export const normalizeEmail = (v) => String(v || "").trim().toLowerCase() || null;

// +90 / 0 önekleri ve boşluklar fark etmesin: sadece rakamlar, son 10 hane.
export const normalizePhone = (v) => {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

// E-posta VEYA telefon eşleşen aktif kilitli fiyatı döner (yoksa null).
// Birden fazla eşleşirse öğrenciye en avantajlı (en düşük) fiyat değil, en
// yeni kayıt geçerli olur — admin bir kaydı güncellemek için yenisini ekleyebilsin.
export async function findActivePriceLock({ email, phone }) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  const or = [];
  if (e) or.push({ email: e });
  if (p) or.push({ phone: p });
  if (or.length === 0) return null;
  return prisma.priceLock.findFirst({
    where: { active: true, OR: or },
    orderBy: { createdAt: "desc" },
  });
}
