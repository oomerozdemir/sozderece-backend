import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** ✅ 1) Sepete ürün ekleme / güncelleme */
export const addToCart = async (req, res) => {
  try {
    const { slug, title, unitPrice, quantity = 1, email: emailFromBody } = req.body;
    const userId = req.user?.id ?? null;   // login ise
    const email  = emailFromBody ?? null;  // guest için

    if (!slug || !title || unitPrice == null) {
      return res.status(400).json({ success: false, message: "slug, title ve unitPrice zorunludur." });
    }
    if (!userId && !email) {
      return res.status(400).json({ success: false, message: "Giriş yapın ya da email gönderin." });
    }

    const qty = Number(quantity) || 1;
    const priceInt = Number(unitPrice);
    if (!Number.isInteger(priceInt) || priceInt < 0) {
      return res.status(400).json({ success: false, message: "unitPrice kuruş cinsinden pozitif tamsayı olmalıdır." });
    }

    // Aktif sepeti bul (completed:false) veya oluştur
    let cart = await prisma.cart.findFirst({
      where: {
        completed: false,
        ...(userId ? { userId } : { email })
      },
      include: { items: true },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          completed: false,
          userId,
          // Prisma'da opsiyonel alanı 'undefined' bırakmak gerekiyor, yoksa null set edersin
          email: userId ? undefined : email,
        },
        include: { items: true },
      });
    }

    // Aynı ürün varsa miktarı artır; yoksa oluştur
    const existing = cart.items.find((i) => i.slug === slug);
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + qty },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          slug,
          title,
          unitPrice: priceInt,
          quantity: qty,
        },
      });
    }

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
