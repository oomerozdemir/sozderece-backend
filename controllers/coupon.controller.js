import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ✅ Kupon kodu doğrulama ve detay döndürme
export const validateCoupon = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Kullanıcı doğrulanamadı veya rol bilgisi eksik." });
    }

    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Kupon kodu gereklidir." });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code },
      include: { usedBy: true },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Kupon bulunamadı." });
    }

    const userUsed = coupon.usedBy.some((usage) => usage.userId === userId);

    if (userUsed) {
      return res.status(400).json({ error: "Bu kuponu zaten kullandınız." });
    }

    if (coupon.usedBy.length >= coupon.usageLimit) {
      return res.status(400).json({ error: "Kupon kullanım hakkı dolmuş." });
    }

    return res.json({ success: true, discountRate: coupon.discountRate });
  } catch (error) {
    console.error("❌ Kupon doğrulama hatası:", error);
    return res.status(500).json({ error: "Sunucu hatası." });
  }
};


// ✅ Kuponu kullanıcı adına işaretleme (kullanıldı)
export const markCouponUsed = async (req, res) => {
  const { code, userId } = req.body;

  try {
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) return res.status(404).json({ error: "Kupon bulunamadı" });

    await prisma.couponUsage.create({
      data: {
        userId,
        couponId: coupon.id,
      },
    });

    return res.status(200).json({ message: "Kupon başarıyla kullanıldı" });
  } catch (err) {
    console.error("Kupon kullanım hatası:");
    res.status(500).json({ error: "Sunucu hatası" });
  }
};

// ✅ Admin tarafından kupon oluşturma
export const createCoupon = async (req, res) => {
  try {
    const { code, discountRate, maxUsage } = req.body;

    const newCoupon = await prisma.coupon.create({
      data: {
        code,
        discountRate: parseInt(discountRate),
        usageLimit: parseInt(maxUsage), // ✅ burada usageLimit'e eşleştiriyoruz
      },
    });

    res.status(201).json({ message: "Kupon başarıyla oluşturuldu.", coupon: newCoupon });
  } catch (error) {
    console.error("Kupon oluşturulamadı:");
    res.status(500).json({ error: "Kupon oluşturulamadı." });
  }
};

export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      include: {
        usedBy: true,
      },
    });

    const enrichedCoupons = coupons.map(coupon => ({
      ...coupon,
      usedCount: coupon.usedBy.length,
    }));

    res.json({ coupons: enrichedCoupons });
  } catch (error) {
    console.error("Kuponlar alınamadı:");
    res.status(500).json({ error: "Kuponlar alınamadı." });
  }
};



export const deleteCoupon = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.coupon.delete({ where: { id } });
    res.status(200).json({ message: "Kupon silindi." });
  } catch (error) {
    console.error("Kupon silinemedi:");
    res.status(500).json({ error: "Kupon silinemedi." });
  }
};