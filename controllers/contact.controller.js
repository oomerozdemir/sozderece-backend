import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const createContact = async (req, res) => {
  try {
    const { name, phone, email, message } = req.body;

    const newContact = await prisma.contact.create({
      data: { name, phone, email, message }
    });

    res.status(201).json({ success: true, data: newContact });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ success: false, message: "Bir hata oluştu." });
  }
};
