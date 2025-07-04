// controllers/studentController.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: "Geçersiz kullanıcı kimliği" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        assignedCoach: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    res.json(user);
  } catch (error) {
    console.error("Öğrenci bilgileri alınamadı:", error);
    res.status(500).json({ message: "Bir hata oluştu." });
  }
};
