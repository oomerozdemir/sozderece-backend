import prisma from "../utils/prisma.js";
import { computeUnitPriceForPackage } from "../utils/packagePricing.js";


/** ✅ 1) Sepete ürün ekleme / güncelleme */
export const addToCart = async (req, res) => {
  try {
    const { slug, title, unitPrice, quantity = 1, email: emailFromBody, planIndex } = req.body;
    const userId = req.user?.id ?? null;   // login ise
    const email  = emailFromBody ?? null;  // guest için

    if (!slug || !title) {
      return res.status(400).json({ success: false, message: "slug ve title zorunludur." });
    }
    if (!userId && !email) {
      return res.status(400).json({ success: false, message: "Giriş yapın ya da email gönderin." });
    }

    const qty = Number(quantity) || 1;

    // Fiyatı DB'deki güncel paketten al — öncelik: plan > sınav > statik promo > normal
    let priceInt = Number(unitPrice);
    const dbPkg = await prisma.package.findUnique({ where: { slug } });
    if (dbPkg) {
      const computed = computeUnitPriceForPackage(dbPkg, planIndex);
      if (computed != null) priceInt = computed;
    }

    if (!Number.isInteger(priceInt) || priceInt < 0) {
      return res.status(400).json({ success: false, message: "unitPrice kuruş cinsinden pozitif tamsayı olmalıdır." });
    }

    // Aynı kullanıcı/e-posta için eşzamanlı "sepet yoksa oluştur" isteklerinin
    // iki ayrı açık sepet üretmesini engellemek üzere transaction-scoped
    // Postgres advisory lock (unique constraint eklemeden race-safe hale getirir).
    const lockKey = userId ? `cart_user_${userId}` : `cart_email_${email}`;
    const cart = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      let c = await tx.cart.findFirst({
        where: {
          completed: false,
          ...(userId ? { userId } : { email })
        },
        include: { items: true },
      });

      if (!c) {
        c = await tx.cart.create({
          data: {
            completed: false,
            userId,
            // Prisma'da opsiyonel alanı 'undefined' bırakmak gerekiyor, yoksa null set edersin
            email: userId ? undefined : email,
          },
          include: { items: true },
        });
      }

      // Aynı ürün varsa fiyatı ve miktarı güncelle; yoksa oluştur
      const existing = c.items.find((i) => i.slug === slug);
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + qty, unitPrice: priceInt, title },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: c.id,
            slug,
            title,
            unitPrice: priceInt,
            quantity: qty,
          },
        });
      }

      return c;
    });

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: true },
    });

    // 🔁 Tek tip cevap (asla null değil)
    return res.json({
      success: true,
      cart: {
        id: updated.id,
        items: updated.items,
      }
    });
  } catch (err) {
    console.error("addToCart error:", err);
    return res.status(500).json({ success: false, message: "Sepete eklenirken hata oluştu." });
  }
};

/** ✅ 2) Sepeti getirme */
export const getCart = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const email  = req.query.email ?? null; // misafir için opsiyon

    let cart = null;

    if (userId || email) {
      cart = await prisma.cart.findFirst({
        where: {
          completed: false,
          ...(userId ? { userId } : { email })
        },
        include: { items: true },
      });
    }

    // 🔁 Tek tip cevap (boşsa bile items: [])
    if (!cart) {
      return res.json({ success: true, cart: { items: [] } });
    }

    return res.json({
      success: true,
      cart: {
        id: cart.id,
        items: cart.items,
      }
    });
  } catch (err) {
    console.error("getCart error:", err);
    return res.status(500).json({ success: false, message: "Sepet getirilirken hata oluştu." });
  }
};

// === Item miktarı arttır/azalt veya set et ===
export const updateItemQuantity = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const email = req.body?.email ?? null;
    const { slug, op, quantity } = req.body;

    if (!slug) return res.status(400).json({ success:false, message:"slug zorunlu" });
    if (!userId && !email) return res.status(400).json({ success:false, message:"Giriş yapın ya da email gönderin." });

    const cart = await prisma.cart.findFirst({
      where: { completed:false, ...(userId ? { userId } : { email }) },
      include: { items:true },
    });
    if (!cart) return res.json({ success:true, cart:{ items:[] } });

    const item = cart.items.find(i => i.slug === slug);
    if (!item) return res.json({ success:true, cart:{ id:cart.id, items:cart.items } });

    let newQty = item.quantity;
    if (op === "increase") newQty = item.quantity + 1;
    else if (op === "decrease") newQty = item.quantity - 1;
    else if (op === "set") newQty = Number(quantity) || 1;

    if (newQty <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: newQty } });
    }

    const updated = await prisma.cart.findUnique({ where:{ id: cart.id }, include:{ items:true } });
    return res.json({ success:true, cart:{ id: updated.id, items: updated.items } });
  } catch (err) {
    console.error("updateItemQuantity error:", err);
    return res.status(500).json({ success:false, message:"Miktar güncellenirken hata oluştu." });
  }
};

// === Item sil ===
export const removeItem = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const email = req.body?.email ?? null;
    const { slug } = req.params;

    if (!slug) return res.status(400).json({ success:false, message:"slug zorunlu" });
    if (!userId && !email) return res.status(400).json({ success:false, message:"Giriş yapın ya da email gönderin." });

    const cart = await prisma.cart.findFirst({
      where: { completed:false, ...(userId ? { userId } : { email }) },
      include: { items:true },
    });
    if (!cart) return res.json({ success:true, cart:{ items:[] } });

    const item = cart.items.find(i => i.slug === slug);
    if (item) await prisma.cartItem.delete({ where: { id: item.id } });

    const updated = await prisma.cart.findUnique({ where:{ id: cart.id }, include:{ items:true } });
    return res.json({ success:true, cart:{ id: updated.id, items: updated.items } });
  } catch (err) {
    console.error("removeItem error:", err);
    return res.status(500).json({ success:false, message:"Ürün silinirken hata oluştu." });
  }
};

