import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const getAssignedStudents = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ userId ile coach kaydını bul
    const coach = await prisma.coach.findUnique({
      where: {
        userId: userId,
      },
    });

    if (!coach) {
      return res.status(404).json({ message: "Koç profili bulunamadı." });
    }

    // 2️⃣ coach.id ile atanmış öğrencileri getir
    const students = await prisma.user.findMany({
      where: {
        assignedCoachId: coach.id,
        role: "student",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        grade: true,
        track: true,
      },
    });

    res.status(200).json({ students });
  } catch (error) {
    console.error("Koç öğrencileri getirme hatası:");
    res.status(500).json({ message: "Öğrenciler getirilemedi." });
  }
};

export const getAllPublicCoaches = async (req, res) => {
  try {
    const coaches = await prisma.coach.findMany({
      select: {
        id: true,
        name: true,
        subject: true,
        description: true,
        image: true,
      },
    });

    res.status(200).json(coaches);
  } catch (error) {
    console.error("Koçlar alınamadı:");
    res.status(500).json({ error: "Koçlar alınamadı." });
  }
};

