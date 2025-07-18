import { PrismaClient } from "@prisma/client";
import { sendVerificationEmail } from "../utils/sendEmail.js"; 
const prisma = new PrismaClient();

export const createVerificationCode = async ({ userId, type, target }) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const normalizedTarget = target.trim().toLowerCase();

  // ⛔ Rate Limit Kontrolü (60 saniye içinde tekrar göndermeyi engelle)
  const existing = await prisma.verificationCode.findFirst({
    where: {
      userId,
      type,
      target: normalizedTarget,
      createdAt: {
        gt: new Date(Date.now() - 60 * 1000) // son 60 saniyede var mı?
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    throw new Error("Lütfen yeni bir kod istemeden önce biraz bekleyin.");
  }

  // ✅ Kod Kaydet
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
 
  if (!record || record.code !== code) {
  throw new Error("Geçersiz veya süresi dolmuş kod.");
}

  await prisma.verificationCode.delete({ where: { id: record.id } });

  return true;
};
