import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Tüm paketleri getir
export const getAllPackages = async (req, res) => {
  try {
    const packages = await prisma.package.findMany();
    res.json({ success: true, packages });
  } catch (err) {
    console.error("Paketler alınamadı:");
    res.status(500).json({ success: false, message: "Paketler alınamadı." });
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
