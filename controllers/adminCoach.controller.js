import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcrypt';



const prisma = new PrismaClient();


// Tüm koçları listele
export const getAllCoaches = async (req, res) => {
  try {
const coaches = await prisma.coach.findMany({
  include: {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    },
    assignedTo: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
});
    res.status(200).json(coaches);
  } catch (error) {
    console.error("Koçlar alınamadı:", error);
    res.status(500).json({ error: "Koçlar alınamadı." });
  }
};


export const createCoachWithUser = async (req, res) => {
  try {
    const { name, email, subject, description } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "İsim ve e-posta zorunludur." });
    }

    // Kullanıcı zaten varsa
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Bu e-posta ile bir kullanıcı zaten var." });
    }

    const hashedPassword = await bcrypt.hash("default123", 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "coach",
        isVerified: true,
        emailVerified: true,
      },
    });

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    await prisma.coach.create({
      data: {
        name,
        subject,
        description,
        image: imagePath,
        userId: newUser.id,
      },
    });

    res.status(201).json({ message: "Koç başarıyla oluşturuldu.", userId: newUser.id });
  } catch (error) {
    console.error("Koç (user) oluşturulamadı:", error);
    res.status(500).json({ message: "Koç oluşturulurken bir hata oluştu." });
  }
};



// Koçu güncelle
export const updateCoach = async (req, res) => {
  try {
    const { name, subject, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : undefined;

    const updatedCoach = await prisma.coach.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        subject,
        description,
        ...(image && { image }),
      },
    });

    res.status(200).json(updatedCoach);
  } catch (error) {
    console.error("Koç güncellenemedi:", error);
    res.status(500).json({ message: "Koç güncellenemedi." });
  }
};


// Koçu sil
export const deleteCoach = async (req, res) => {
  try {
    await prisma.coach.delete({
      where: { id: parseInt(req.params.id) },
    });

    res.status(200).json({ message: "Koç silindi." });
  } catch (error) {
    console.error("Koç silinemedi:", error);
    res.status(500).json({ message: "Koç silinemedi." });
  }
};

// Bir kullanıcıya koç atama veya koçu kaldırma
export const assignCoachToUser = async (req, res) => {
  try {
    const { userId, coachId } = req.body;

    // Kullanıcı kontrolü
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    let assignedCoachData = null;

    // Eğer coachId gönderilmişse, koç kontrolü yap
    if (coachId) {
      const coach = await prisma.coach.findUnique({ where: { id: parseInt(coachId) } });
      if (!coach) {
        return res.status(404).json({ message: "Koç bulunamadı." });
      }
      assignedCoachData = {
        id: coach.id,
        name: coach.name,
        subject: coach.subject,
      };
    }

    // Kullanıcıya koç ata veya kaldır (coachId null olabilir)
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        assignedCoachId: coachId ? parseInt(coachId) : null,
      },
    });

    return res.status(200).json({
      message: coachId ? "Koç başarıyla atandı." : "Koç kaldırıldı.",
      coach: assignedCoachData,
    });
  } catch (error) {
    console.error("Koç atama hatası:", error);
    res.status(500).json({ message: "Koç atama işlemi başarısız oldu." });
  }
};

