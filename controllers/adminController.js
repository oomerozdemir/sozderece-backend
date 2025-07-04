import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        grade: true,
        track: true,
        createdAt: true,
        assignedCoach: {
          select: {
            id: true,
            name: true,
            subject: true,
            
          },
        },
      },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Admin getAllUsers error:", error);
    res.status(500).json({ message: "Kullanıcılar getirilemedi." });
  }
};



// Kullanıcıyı sil
export const deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Kullanıcı silinemedi:", error);
    res.status(500).json({ error: "Kullanıcı silinemedi." });
  }
};

// Kullanıcıyı güncelle
export const updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, role, phone } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, email, role, phone },
      include: {
        assignedCoach: {
          select: {
            id: true,
            name: true,
            subject: true,
          },
        },
      },
    });

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Kullanıcı güncellenemedi:", error);
    res.status(500).json({ error: "Kullanıcı güncellenemedi." });
  }
};


export const createUserAsAdmin = async (req, res) => {
  const { name, email, password, role } = req.body;
  const existingUser = await prisma.user.findUnique({
  where: { email },
});

if (existingUser) {
  return res.status(400).json({ error: "Bu e-posta ile zaten bir kullanıcı mevcut." });
}

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Tüm alanlar zorunludur." });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        isVerified: true,
        emailVerified: true,
      },
    });
    res.status(201).json(user);
  } catch (error) {
    console.error("Koç (user) oluşturulamadı:", error);
    res.status(500).json({ error: "Kullanıcı oluşturulamadı." });
  }
};
