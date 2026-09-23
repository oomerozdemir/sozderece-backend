import prisma from "../utils/prisma.js";
import { findActivePriceLock, normalizeEmail, normalizePhone } from "../utils/priceLock.js";

// Devam paketinin vitrine dönük (güvenli) alanları — ham DB kaydı dönülmez.
const publicPackage = (pkg, unitPrice) => ({
  slug: pkg.slug,
  name: pkg.name,
  description: pkg.description,
  subtitle: pkg.subtitle,
  features: pkg.features,
  note: pkg.note,
  guaranteeText: pkg.guaranteeText,
  noRefund: pkg.noRefund,
  billingCycle: "once",
  unitPrice,
  price: unitPrice / 100,
  plans: [],
});

// POST /api/price-locks/check  { email?, phone? }
// Kayıtlı bir kilitli fiyat varsa fiyatı ve devam paketini döner. Hesap
// keşfini zorlaştırmak için yanıt "yok" durumunda hep aynı, sebep belirtmez.
export const checkPriceLock = async (req, res) => {
  try {
    const { email, phone } = req.body || {};
    const lock = await findActivePriceLock({ email, phone });
    if (!lock) return res.json({ success: true, eligible: false });

    const pkg = await prisma.package.findFirst({ where: { requiresPriceLock: true } });
    if (!pkg) return res.json({ success: true, eligible: false });

    res.json({
      success: true,
      eligible: true,
      unitPrice: lock.unitPrice,
      label: lock.label,
      package: publicPackage(pkg, lock.unitPrice),
    });
  } catch (err) {
    console.error("checkPriceLock:", err);
    res.status(500).json({ success: false, message: "Kontrol yapılamadı." });
  }
};

const cleanBody = (b) => {
  const unitPrice = Math.round(Number(b.unitPriceTL) * 100);
  return {
    email: normalizeEmail(b.email),
    phone: normalizePhone(b.phone),
    unitPrice,
    label: b.label ? String(b.label).trim().slice(0, 120) : null,
    note: b.note ? String(b.note).trim().slice(0, 500) : null,
    active: b.active === undefined ? true : b.active === true || b.active === "true",
  };
};

const validate = (d) => {
  if (!d.email && !d.phone) return "E-posta veya telefon zorunludur.";
  if (!Number.isInteger(d.unitPrice) || d.unitPrice <= 0) return "Geçerli bir aylık fiyat (TL) girin.";
  return null;
};

export const listPriceLocks = async (req, res) => {
  try {
    const locks = await prisma.priceLock.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, locks });
  } catch (err) {
    console.error("listPriceLocks:", err);
    res.status(500).json({ success: false, message: "Liste alınamadı." });
  }
};

export const createPriceLock = async (req, res) => {
  try {
    const data = cleanBody(req.body || {});
    const bad = validate(data);
    if (bad) return res.status(400).json({ success: false, message: bad });
    const user = data.email ? await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }) : null;
    const lock = await prisma.priceLock.create({ data: { ...data, userId: user?.id ?? null } });
    res.status(201).json({ success: true, lock });
  } catch (err) {
    console.error("createPriceLock:", err);
    res.status(500).json({ success: false, message: "Kayıt oluşturulamadı." });
  }
};

export const updatePriceLock = async (req, res) => {
  try {
    const data = cleanBody(req.body || {});
    const bad = validate(data);
    if (bad) return res.status(400).json({ success: false, message: bad });
    const lock = await prisma.priceLock.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ success: true, lock });
  } catch (err) {
    console.error("updatePriceLock:", err);
    res.status(500).json({ success: false, message: "Kayıt güncellenemedi." });
  }
};

export const deletePriceLock = async (req, res) => {
  try {
    await prisma.priceLock.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    console.error("deletePriceLock:", err);
    res.status(500).json({ success: false, message: "Kayıt silinemedi." });
  }
};
