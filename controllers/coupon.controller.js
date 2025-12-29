import prisma from "../utils/prisma.js";


// ✅ Kupon kodu doğrulama ve detay döndürme
export const validateCoupon = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Kullanıcı doğrulanamadı." });
    }

    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Kupon kodu gereklidir." });
    }

    // 1. Kuponu bul
    const coupon = await prisma.coupon.findUnique({
      where: { code },
      include: { usedBy: true },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Kupon bulunamadı." });
    }

    // 2. Kullanıcı daha önce kullandı mı? (Kupon bazlı kontrol)
    const userUsed = coupon.usedBy.some((usage) => usage.userId === userId);
    if (userUsed) {
      return res.status(400).json({ error: "Bu kuponu zaten kullandınız." });
    }

    // 3. Genel kullanım limiti doldu mu?
    if (coupon.usedBy.length >= coupon.usageLimit) {
      return res.status(400).json({ error: "Kupon kullanım hakkı dolmuş." });
    }

    // ✅ 4. "İlk Sipariş" Kontrolü (DÜZELTİLEN KISIM)
    const isFirstOrderCoupon = code === "Sozderece200" || coupon.isFirstOrder === true;

    if (isFirstOrderCoupon) {
      // Kullanıcının daha önce ödenmiş (paid) veya iade süreci başlamış siparişi var mı?
      // NOT: 'failed', 'pending' veya 'pending_payment' olanlar sayılmaz.
      const previousOrders = await prisma.order.count({
        where: {
          userId: userId,
          status: {
            in: ["paid", "refund_requested", "refunded"] // ✅ 'success' yerine sisteminizdeki gerçek durumları yazdık.
          }
        }
      });

      if (previousOrders > 0) {
        return res.status(400).json({ 
          error: "Bu fırsat sadece ilk siparişinize özeldir. Daha önce siparişiniz bulunmaktadır." 
        });
      }
    }

    // 5. Başarılı yanıt
    return res.json({ 
      success: true, 
      code: coupon.code,
      discountRate: coupon.discountRate, 
      discountAmount: coupon.discountAmount || (coupon.code === "Sozderece200" ? 20000 : 0),
      type: coupon.type || (coupon.code === "Sozderece200" ? "FIXED" : "RATE"),
      validPackages: coupon.validPackages || [] 
    });

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
    // Frontend'den gelen yeni alanları alıyoruz
    const { code, discountRate, maxUsage, type, isFirstOrder, discountAmount } = req.body;

    const newCoupon = await prisma.coupon.create({
      data: {
        code,
        usageLimit: parseInt(maxUsage),
        // Tipine göre verileri işle
        type: type || "RATE", 
        isFirstOrder: isFirstOrder || false,
        discountRate: discountRate ? parseInt(discountRate) : null,
        discountAmount: discountAmount ? parseInt(discountAmount) : null, 
      },
    });

    res.status(201).json({ message: "Kupon oluşturuldu.", coupon: newCoupon });
  } catch (error) {
    console.error(error);
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