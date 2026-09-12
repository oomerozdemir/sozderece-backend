import prisma from "../utils/prisma.js";

// Öğrenci paneli (Faz 1): Kaynak Kütüphanesi + Gündem/Duyurular admin CRUD'u.
// package.controller.js ile aynı desen — basit, açık, kopyala-uyarla.

/* ── Resources (Kaynaklar) ── */

export const getAllResources = async (req, res) => {
  try {
    const resources = await prisma.resource.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }] });
    res.json({ success: true, resources });
  } catch (err) {
    console.error("Kaynaklar alınamadı:", err);
    res.status(500).json({ success: false, message: "Kaynaklar alınamadı." });
  }
};

export const createResource = async (req, res) => {
  try {
    const { title, description, type, url, targetTrack, targetGrade, subject, displayOrder, hidden } = req.body;
    if (!title || !type || !url) {
      return res.status(400).json({ success: false, message: "Başlık, tür ve link zorunludur." });
    }
    const resource = await prisma.resource.create({
      data: {
        title,
        description: description || null,
        type,
        url,
        targetTrack: targetTrack || null,
        targetGrade: targetGrade || null,
        subject: subject || null,
        displayOrder: parseInt(displayOrder) || 0,
        hidden: hidden === true || hidden === "true",
      },
    });
    res.status(201).json({ success: true, resource });
  } catch (err) {
    console.error("Kaynak oluşturulamadı:", err);
    res.status(500).json({ success: false, message: "Kaynak oluşturulamadı." });
  }
};

export const updateResource = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, type, url, targetTrack, targetGrade, subject, displayOrder, hidden } = req.body;
    const resource = await prisma.resource.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(type !== undefined && { type }),
        ...(url !== undefined && { url }),
        ...(targetTrack !== undefined && { targetTrack: targetTrack || null }),
        ...(targetGrade !== undefined && { targetGrade: targetGrade || null }),
        ...(subject !== undefined && { subject: subject || null }),
        ...(displayOrder !== undefined && { displayOrder: parseInt(displayOrder) || 0 }),
        ...(hidden !== undefined && { hidden: hidden === true || hidden === "true" }),
      },
    });
    res.json({ success: true, resource });
  } catch (err) {
    console.error("Kaynak güncellenemedi:", err);
    res.status(500).json({ success: false, message: "Kaynak güncellenemedi." });
  }
};

export const deleteResource = async (req, res) => {
  try {
    await prisma.resource.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: "Kaynak silindi." });
  } catch (err) {
    console.error("Kaynak silinemedi:", err);
    res.status(500).json({ success: false, message: "Kaynak silinemedi." });
  }
};

/* ── Announcements (Gündem) ── */

export const getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" } });
    res.json({ success: true, announcements });
  } catch (err) {
    console.error("Duyurular alınamadı:", err);
    res.status(500).json({ success: false, message: "Duyurular alınamadı." });
  }
};

export const createAnnouncement = async (req, res) => {
  try {
    const { title, body, targetTrack, targetGrade, expiresAt, hidden } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Başlık ve içerik zorunludur." });
    }
    const announcement = await prisma.announcement.create({
      data: {
        title,
        body,
        targetTrack: targetTrack || null,
        targetGrade: targetGrade || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        hidden: hidden === true || hidden === "true",
      },
    });
    res.status(201).json({ success: true, announcement });
  } catch (err) {
    console.error("Duyuru oluşturulamadı:", err);
    res.status(500).json({ success: false, message: "Duyuru oluşturulamadı." });
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, body, targetTrack, targetGrade, expiresAt, hidden } = req.body;
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(targetTrack !== undefined && { targetTrack: targetTrack || null }),
        ...(targetGrade !== undefined && { targetGrade: targetGrade || null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(hidden !== undefined && { hidden: hidden === true || hidden === "true" }),
      },
    });
    res.json({ success: true, announcement });
  } catch (err) {
    console.error("Duyuru güncellenemedi:", err);
    res.status(500).json({ success: false, message: "Duyuru güncellenemedi." });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: "Duyuru silindi." });
  } catch (err) {
    console.error("Duyuru silinemedi:", err);
    res.status(500).json({ success: false, message: "Duyuru silinemedi." });
  }
};
