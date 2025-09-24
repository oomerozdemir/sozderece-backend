import prisma from "../utils/prisma.js";
import { PACKAGES } from "../utils/packageCatalog.js";

function mapFromCatalog() {
  // FE şu şemayı bekliyor: { success, packages: [{ name, description, price }] }
  // Bizim katalogta: { title, subtitle, unitPrice(kuruş), ... }
  // price alanını TL olarak döndürüyoruz (Float).
  const arr = Object.values(PACKAGES || {});
  return arr.map(p => ({
    name: p.title || p.slug || "Paket",
    description: p.subtitle || p.note || "",
    price: typeof p.unitPrice === "number" ? p.unitPrice / 100 : null, // kuruş → TL
  }));
}

// Tüm paketleri getir
export const getAllPackages = async (_req, res) => {
  try {
    const packages = await prisma.package.findMany(); // DB
    if (packages && packages.length > 0) {
      return res.json({ success: true, packages });
    }

    // 🔁 DB boşsa → fallback: packages.js
    const fallback = mapFromCatalog();
    if (fallback.length > 0) {
      return res.json({ success: true, packages: fallback });
    }

    // Her ihtimale karşı
    return res.json({ success: true, packages: [] });
  } catch (err) {
    console.error("Paketler alınamadı:", err?.message || err);
    // Hata anında bile FE boş kalmasın istiyorsan fallback dönebilirsin:
    try {
      const fallback = mapFromCatalog();
      return res.json({ success: true, packages: fallback });
    } catch {
      return res.status(500).json({ success: false, message: "Paketler alınamadı." });
    }
  }
};

// (Opsiyonel) Yeni paket eklemek için
export const createPackage = async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const created = await prisma.package.create({
      data: { name, description, price: parseFloat(price) }
    });
    res.status(201).json({ success: true, package: created });
  } catch (err) {
    res.status(500).json({ success: false, message: "Paket oluşturulamadı." });
  }
};

