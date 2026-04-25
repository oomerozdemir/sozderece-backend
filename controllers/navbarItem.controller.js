import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Public — sadece görünür öğeler
export const getNavbarItems = async (req, res) => {
  try {
    const items = await prisma.navbarItem.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
    });
    res.json(items);
  } catch (err) {
    console.error("getNavbarItems:", err);
    res.status(500).json({ error: "Navbar öğeleri alınamadı." });
  }
};

// Admin — tümü
export const getAllNavbarItems = async (req, res) => {
  try {
    const items = await prisma.navbarItem.findMany({
      orderBy: { order: "asc" },
    });
    res.json(items);
  } catch (err) {
    console.error("getAllNavbarItems:", err);
    res.status(500).json({ error: "Navbar öğeleri alınamadı." });
  }
};

// Admin — yeni öğe
export const createNavbarItem = async (req, res) => {
  try {
    const { name, path, visible = true, order = 0, isExternal = false, openInNew = false } = req.body;
    if (!name || !path) {
      return res.status(400).json({ error: "name ve path zorunludur." });
    }
    const item = await prisma.navbarItem.create({
      data: { name, path, visible, order, isExternal, openInNew },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error("createNavbarItem:", err);
    res.status(500).json({ error: "Öğe oluşturulamadı." });
  }
};

// Admin — güncelle
export const updateNavbarItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, path, visible, order, isExternal, openInNew } = req.body;
    const item = await prisma.navbarItem.update({
      where: { id },
      data: { name, path, visible, order, isExternal, openInNew },
    });
    res.json(item);
  } catch (err) {
    console.error("updateNavbarItem:", err);
    res.status(500).json({ error: "Öğe güncellenemedi." });
  }
};

// Admin — sil
export const deleteNavbarItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.navbarItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("deleteNavbarItem:", err);
    res.status(500).json({ error: "Öğe silinemedi." });
  }
};

// Admin — toplu sıralama güncelle
export const reorderNavbarItems = async (req, res) => {
  try {
    const { items } = req.body; // [{ id, order }, ...]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items dizisi gerekli." });
    }
    await Promise.all(
      items.map(({ id, order }) =>
        prisma.navbarItem.update({ where: { id }, data: { order } })
      )
    );
    res.json({ success: true });
  } catch (err) {
    console.error("reorderNavbarItems:", err);
    res.status(500).json({ error: "Sıralama güncellenemedi." });
  }
};
