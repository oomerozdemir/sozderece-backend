import { PrismaClient } from "@prisma/client";



const prisma = new PrismaClient();

// Siparişleri getir
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "Kullanıcı doğrulanamadı." });
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        billingInfo: true,
        orderItems: true,
      },
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Siparişler alınamadı:", error);
    res.status(500).json({ message: "Siparişler alınamadı." });
  }
};

// Sipariş oluştur
export const createOrderWithBilling = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      billingInfo: billingInfoData,
      cart,
      packageName,
      couponCode,
    } = req.body;

    const now = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(now.getMonth() + 1);

    const billingInfo = await prisma.billingInfo.create({
      data: {
        email: billingInfoData.email,
        name: billingInfoData.name,
        surname: billingInfoData.surname,
        address: billingInfoData.address,
        district: billingInfoData.district,
        city: billingInfoData.city,
        postalCode: billingInfoData.postalCode,
        phone: billingInfoData.phone,
        allowEmails: billingInfoData.allowEmails,
      },
    });

    const order = await prisma.order.create({
      data: {
        package: packageName,
        startDate: now,
        endDate: oneMonthLater,
        user: { connect: { id: userId } },
        billingInfo: { connect: { id: billingInfo.id } },
      },
    });

    const orderItems = cart.map((item) => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity || 1,
      description: item.description,
      orderId: order.id,
    }));

    await prisma.orderItem.createMany({ data: orderItems });

    // ✅ Kupon kodu kullanımı kaydet
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode },
        include: { usedBy: true }
      });

      if (
        coupon &&
        !coupon.usedBy.some((u) => u.id === userId) &&
        coupon.usedBy.length < coupon.usageLimit
      ) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            usedCoupons: {
              connect: { id: coupon.id }
            }
          }
        });
      }
    }

     await prisma.user.update({
      where: { id: userId },
      data: {
        grade,
        track
      }
    });

    res.status(201).json({ message: "Sipariş başarıyla oluşturuldu." });
  } catch (error) {
    console.error("Sipariş oluşturulurken hata:", error);
    res.status(500).json({ error: "Sipariş oluşturulamadı." });
  }
};


// İade talebi oluştur
export const createRefundRequest = async (req, res) => {
  const userId = req.user.id;
  const orderId = parseInt(req.params.id);
  const { reason, explanation } = req.body;

  try {
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
        status: "active"
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: "Sipariş bulunamadı veya aktif değil." });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "refund_requested",
        refundReason: reason,
        refundMessage: explanation
      }
    });

    res.status(200).json({ message: "İade talebi oluşturuldu." });
  } catch (error) {
    console.error("İade talebi hatası:", error);
    res.status(500).json({ message: "Sunucu hatası." });
  }
};
