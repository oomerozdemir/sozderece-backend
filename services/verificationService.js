import { PrismaClient } from "@prisma/client";
import { sendVerificationEmail } from "../utils/sendEmail.js"; 
const prisma = new PrismaClient();

export const createVerificationCode = async ({ userId, type, target }) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const normalizedTarget = target.trim().toLowerCase();

  try {
    const record = await prisma.verificationCode.create({
      data: {
        userId,
        type,
        target: normalizedTarget,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    console.log("✅ Kod DB'ye kaydedildi:", record);

    if (type === "email") {
      await sendVerificationEmail(normalizedTarget, code);
    }

    return code;

  } catch (err) {
    console.error("❌ Kod DB'ye kaydedilemedi:", err);
    throw new Error("Kod oluşturulamadı");
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
 console.log("Doğrulama gelen veri:", { userId, type, target, code });
  console.log("DB'deki son kayıt:", record);
  if (!record || record.code !== code) {
  throw new Error("Geçersiz veya süresi dolmuş kod.");
}

  await prisma.verificationCode.delete({ where: { id: record.id } });

  return true;
};
