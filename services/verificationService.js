import prisma from "../utils/prisma.js";



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
        const ms = Date.now() - existing.createdAt.getTime();
    const retryAfter = Math.max(1, 60 - Math.floor(ms / 1000));
    const err = new Error("Lütfen yeni bir kod istemeden önce biraz bekleyin.");
    err.code = "RATE_LIMIT";
    err.retryAfter = retryAfter;
    throw err;
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
    
  return { id: record.id, code, target: normalizedTarget, type };
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

  // ✅ Kod geçerli, sil
  await prisma.verificationCode.delete({ where: { id: record.id } });

  // ✅ Kullanıcıyı doğrula
  if (type === "email") {
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });
  }

  return true;
};
