import prisma from "../utils/prisma.js";


// ✅ Kupon kodu doğrulama ve detay döndürme
export const validateCoupon = async (req, res) => {
  try {
    // Checkout misafir-öncelikli (bkz. /hemen-basla): giriş yapmış kullanıcı
    // yoksa req.body.email ile aynı "daha önce kullandın mı / ilk siparişin
    // mi" kontrollerini yapıyoruz — hesap, ödeme başarılı olduğunda zaten bu
    // e-postadan otomatik oluşturuluyor (bkz. handlePaytrCallback), o yüzden
    // e-posta burada güvenilir bir kimlik.
    const userId = req.user?.id || null;
    const { code, email } = req.body;
    const guestUser = !userId && email
      ? await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
      : null;
    const effectiveUserId = userId || guestUser?.id || null;

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

    // 2. Süresi dolmuş mu?
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Bu kuponun süresi dolmuş." });
    }

    // 3. Kullanıcı daha önce kullandı mı? (Kupon bazlı kontrol — bilinen bir
    // hesap yoksa, ör. gerçekten ilk kez gelen bir misafir, bu kontrol
    // atlanır; gerçek kullanım kaydı ödeme başarılı olunca asıl userId ile
    // yazılıyor, bkz. handlePaytrCallback#8.)
    if (effectiveUserId) {
      const userUsed = coupon.usedBy.some((usage) => usage.userId === effectiveUserId);
      if (userUsed) {
        return res.status(400).json({ error: "Bu kuponu zaten kullandınız." });
      }
    }

    // 4. Genel kullanım limiti doldu mu?
    if (coupon.usedBy.length >= coupon.usageLimit) {
      return res.status(400).json({ error: "Kupon kullanım hakkı dolmuş." });
    }

    // ✅ 5. "İlk Sipariş" Kontrolü (DÜZELTİLEN KISIM)
    const isFirstOrderCoupon = code === "SOZDERECE200" || coupon.isFirstOrder === true;

    if (isFirstOrderCoupon && effectiveUserId) {
      // Kullanıcının daha önce ödenmiş (paid) veya iade süreci başlamış siparişi var mı?
      // NOT: 'failed', 'pending' veya 'pending_payment' olanlar sayılmaz.
      const previousOrders = await prisma.order.count({
        where: {
          userId: effectiveUserId,
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

    // 6. Başarılı yanıt
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

// ✅ Kuponu kullanıcı adına işaretleme (kullanıldı) — sadece admin çağırabilir
export const markCouponUsed = async (req, res) => {
  // IDOR fix: userId artık güvenilir JWT token'dan alınır, body'den değil.
  // Admin farklı bir kullanıcı için işaretlemek istiyorsa targetUserId parametresi kullanılır.
  const { code, targetUserId } = req.body;
  const userId = targetUserId || req.user.id;

  if (!code) return res.status(400).json({ error: "Kupon kodu gerekli." });
  if (!userId) return res.status(400).json({ error: "Kullanıcı ID gerekli." });

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
    console.error("Kupon kullanım hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
};

// ✅ Admin tarafından kupon oluşturma
export const createCoupon = async (req, res) => {
  try {
    // Frontend'den gelen veriler (validPackages dizisi dahil)
    const { code, discountRate, maxUsage, type, isFirstOrder, discountAmount, validPackages, expiresAt } = req.body;

    // --- DÜZELTME BURADA ---
    // Eğer Sabit Tutar (FIXED) seçildiyse, gelen TL tutarını Kuruşa çevir (x100)
    let finalDiscountAmount = null;
    if (type === "FIXED" && discountAmount) {
        // Kullanıcı 200 girerse -> 200 * 100 = 20000 (200 TL) olarak kaydedilir.
        finalDiscountAmount = parseFloat(discountAmount) * 100;
    }

    const newCoupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(), // Kodları her zaman büyük harf yap
        usageLimit: parseInt(maxUsage),
        type: type || "RATE",
        isFirstOrder: isFirstOrder || false,
        discountRate: discountRate ? parseInt(discountRate) : null,

        // Hesaplanan kuruş değerini kaydediyoruz
        discountAmount: finalDiscountAmount,

        // Paket kısıtlaması
        validPackages: validPackages || [],

        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.status(201).json({ message: "Kupon başarıyla oluşturuldu.", coupon: newCoupon });
  } catch (error) {
    // Unique constraint hatası (Aynı koddan varsa)
    if (error.code === 'P2002') {
        return res.status(400).json({ error: "Bu kupon kodu zaten kullanımda." });
    }
    console.error("Kupon oluşturulamadı:", error);
    res.status(500).json({ error: "Kupon oluşturulamadı." });
  }
};

// ✅ Admin tarafından kupon düzenleme — silip yeniden oluşturmak yerine
// (bu, geçmiş kullanım kayıtlarının couponId ilişkisini koparırdı) mevcut
// kaydı güncelliyor.
export const updateCoupon = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { code, discountRate, maxUsage, type, isFirstOrder, discountAmount, validPackages, expiresAt } = req.body;

    let finalDiscountAmount = null;
    if (type === "FIXED" && discountAmount) {
      finalDiscountAmount = parseFloat(discountAmount) * 100;
    }

    const updated = await prisma.coupon.update({
      where: { id },
      data: {
        code: code.toUpperCase(),
        usageLimit: parseInt(maxUsage),
        type: type || "RATE",
        isFirstOrder: isFirstOrder || false,
        discountRate: type === "RATE" && discountRate ? parseInt(discountRate) : null,
        discountAmount: finalDiscountAmount,
        validPackages: validPackages || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.status(200).json({ message: "Kupon güncellendi.", coupon: updated });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Bu kupon kodu zaten kullanımda." });
    }
    console.error("Kupon güncellenemedi:", error);
    res.status(500).json({ error: "Kupon güncellenemedi." });
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