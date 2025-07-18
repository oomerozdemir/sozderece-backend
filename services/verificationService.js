import { PrismaClient } from "@prisma/client";
import { sendVerificationEmail } from "../utils/sendEmail.js"; 
const prisma = new PrismaClient();

export const createVerificationCode = async ({ userId, type, target }) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    console.log("📨 Kod oluşturuluyor:", { userId, type, target, code });

    await prisma.verificationCode.create({
      data: {
        userId,
        type,
        target: target.toLowerCase().trim(),
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    if (type === "email") {
      await sendVerificationEmail(target, code); // burada da hata olabilir
    }

    return code;
  } catch (error) {
    console.error("❌ createVerificationCode içinde hata:", error.message, error.stack);
    throw new Error("Doğrulama kodu oluşturulamadı.");
  }
};


export const verifyCode = async ({ userId, type, target, code }) => {
   console.log("Doğrulama gelen veri:", { userId, type, target, code });
  const record = await prisma.verificationCode.findFirst({
    where: {
      userId,
      type,
      target,
      code,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) throw new Error("Geçersiz veya süresi dolmuş kod.");

  await prisma.verificationCode.delete({ where: { id: record.id } });

  return true;
};
