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

    // 2. Kullanıcı daha önce kullandı mı?
    const userUsed = coupon.usedBy.some((usage) => usage.userId === userId);
    if (userUsed) {
      return res.status(400).json({ error: "Bu kuponu zaten kullandınız." });
    }

    // 3. Genel kullanım limiti doldu mu?
    if (coupon.usedBy.length >= coupon.usageLimit) {
      return res.status(400).json({ error: "Kupon kullanım hakkı dolmuş." });
    }

    // ✅ 4. "İlk Sipariş" Kontrolü
    // Hem veritabanındaki ayara hem de özel koda bakar
    const isFirstOrderCoupon = code === "Sozderece200" || coupon.isFirstOrder === true;

    if (isFirstOrderCoupon) {
      // Kullanıcının daha önce başarılı (tamamlanmış) siparişi var mı?
      const previousOrders = await prisma.order.count({
        where: {
          userId: userId,
          // Sadece başarılı/ödenmiş siparişleri sayıyoruz (sisteminize göre güncelleyin)
          status: 'success' 
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
      
      // İndirim Değerleri (DB'den veya özel koddan)
      discountRate: coupon.discountRate, 
      discountAmount: coupon.discountAmount || (coupon.code === "Sozderece200" ? 20000 : 0),
      type: coupon.type || (coupon.code === "Sozderece200" ? "FIXED" : "RATE"),
      
      // ✅ ÖNEMLİ: Frontend kontrolü için geçerli paket listesini dönüyoruz
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