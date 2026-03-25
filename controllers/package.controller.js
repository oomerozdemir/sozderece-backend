import prisma from "../utils/prisma.js";

// Tüm paketleri getir (vitrin için sadece görünür olanlar, admin için hepsi)
export const getAllPackages = async (req, res) => {
  try {
    const includeHidden = req.query.all === "true";
    const packages = await prisma.package.findMany({
      where: includeHidden ? {} : { hidden: false },
      orderBy: { displayOrder: "asc" },
    });
    res.json({ success: true, packages });
  } catch (err) {
    console.error("Paketler alınamadı:", err);
    res.status(500).json({ success: false, message: "Paketler alınamadı." });
  }
};

// Yeni paket oluştur
export const createPackage = async (req, res) => {
  try {
    const {
      slug, name, description, price, unitPrice, priceText, oldPriceText,
      subtitle, type, hidden, displayOrder, ctaLabel, ctaHref, features, note, freeLessons,
      promoPrice, promoUnitPrice, promoEndDate, promoLabel,
      examDate, examDiscountRate,
    } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ success: false, message: "Slug ve isim zorunludur." });
    }

    const created = await prisma.package.create({
      data: {
        slug,
        name,
        description: description || "",
        price: parseFloat(price) || 0,
        unitPrice: unitPrice ? parseInt(unitPrice) : null,
        priceText: priceText || null,
        oldPriceText: oldPriceText || null,
        subtitle: subtitle || null,
        type: type || null,
        hidden: hidden === true || hidden === "true",
        displayOrder: parseInt(displayOrder) || 0,
        ctaLabel: ctaLabel || null,
        ctaHref: ctaHref || null,
        features: features || [],
        note: note || null,
        freeLessons: freeLessons ? parseInt(freeLessons) : null,
        promoPrice: promoPrice ? parseFloat(promoPrice) : null,
        promoUnitPrice: promoUnitPrice ? parseInt(promoUnitPrice) : null,
        promoEndDate: promoEndDate ? new Date(promoEndDate) : null,
        promoLabel: promoLabel || null,
        examDate: examDate ? new Date(examDate) : null,
        examDiscountRate: examDiscountRate !== undefined && examDiscountRate !== "" ? parseFloat(examDiscountRate) : null,
      },
    });
    res.status(201).json({ success: true, package: created });
  } catch (err) {
    console.error("Paket oluşturulamadı:", err);
    res.status(500).json({ success: false, message: "Paket oluşturulamadı." });
  }
};

// Paket güncelle
export const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug, name, description, price, unitPrice, priceText, oldPriceText,
      subtitle, type, hidden, displayOrder, ctaLabel, ctaHref, features, note, freeLessons,
      promoPrice, promoUnitPrice, promoEndDate, promoLabel,
      examDate, examDiscountRate,
    } = req.body;

    const updated = await prisma.package.update({
      where: { id: parseInt(id) },
      data: {
        ...(slug !== undefined && { slug }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(unitPrice !== undefined && { unitPrice: unitPrice ? parseInt(unitPrice) : null }),
        ...(priceText !== undefined && { priceText }),
        ...(oldPriceText !== undefined && { oldPriceText }),
        ...(subtitle !== undefined && { subtitle }),
        ...(type !== undefined && { type }),
        ...(hidden !== undefined && { hidden: hidden === true || hidden === "true" }),
        ...(displayOrder !== undefined && { displayOrder: parseInt(displayOrder) }),
        ...(ctaLabel !== undefined && { ctaLabel }),
        ...(ctaHref !== undefined && { ctaHref }),
        ...(features !== undefined && { features }),
        ...(note !== undefined && { note }),
        ...(freeLessons !== undefined && { freeLessons: freeLessons ? parseInt(freeLessons) : null }),
        ...(promoPrice !== undefined && { promoPrice: promoPrice ? parseFloat(promoPrice) : null }),
        ...(promoUnitPrice !== undefined && { promoUnitPrice: promoUnitPrice ? parseInt(promoUnitPrice) : null }),
        ...(promoEndDate !== undefined && { promoEndDate: promoEndDate ? new Date(promoEndDate) : null }),
        ...(promoLabel !== undefined && { promoLabel: promoLabel || null }),
        ...(examDate !== undefined && { examDate: examDate ? new Date(examDate) : null }),
        ...(examDiscountRate !== undefined && { examDiscountRate: examDiscountRate !== "" ? parseFloat(examDiscountRate) : null }),
      },
    });
    res.json({ success: true, package: updated });
  } catch (err) {
    console.error("Paket güncellenemedi:", err);
    res.status(500).json({ success: false, message: "Paket güncellenemedi." });
  }
};

// Vitrin görünürlüğünü aç/kapat
export const togglePackageVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await prisma.package.findUnique({ where: { id: parseInt(id) } });
    if (!pkg) return res.status(404).json({ success: false, message: "Paket bulunamadı." });

    const updated = await prisma.package.update({
      where: { id: parseInt(id) },
      data: { hidden: !pkg.hidden },
    });
    res.json({ success: true, package: updated });
  } catch (err) {
    console.error("Görünürlük değiştirilemedi:", err);
    res.status(500).json({ success: false, message: "Görünürlük değiştirilemedi." });
  }
};

// Paket sil
export const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.package.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: "Paket silindi." });
  } catch (err) {
    console.error("Paket silinemedi:", err);
    res.status(500).json({ success: false, message: "Paket silinemedi." });
  }
};
