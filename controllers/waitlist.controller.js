import prisma from "../utils/prisma.js";

// Kayıtları kapanmış bir teklif sayfasında bırakılan bekleme listesi kaydı —
// bir sonraki dönem/atölye açıldığında önceden haber vermek için.
export const joinWaitlist = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim().toLowerCase();
    const phone = (req.body?.phone || "").trim() || null;
    const source = (req.body?.source || "").trim() || "14-gunde-calisma-aliskanligi-kazan";

    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Ad ve e-posta zorunludur." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Geçerli bir e-posta girin." });
    }

    const entry = await prisma.workshopWaitlist.create({
      data: { name, email, phone, source },
    });
    res.status(201).json({ success: true, entry: { id: entry.id } });
  } catch (err) {
    console.error("joinWaitlist:", err);
    res.status(500).json({ success: false, message: "Kaydedilemedi, lütfen tekrar dene." });
  }
};

/* ── Admin ── */

export const getAllWaitlistEntries = async (req, res) => {
  try {
    const source = req.query.source;
    const entries = await prisma.workshopWaitlist.findMany({
      where: source ? { source } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, entries });
  } catch (err) {
    console.error("getAllWaitlistEntries:", err);
    res.status(500).json({ success: false, message: "Liste alınamadı." });
  }
};

export const deleteWaitlistEntry = async (req, res) => {
  try {
    await prisma.workshopWaitlist.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    console.error("deleteWaitlistEntry:", err);
    res.status(500).json({ success: false, message: "Silinemedi." });
  }
};
