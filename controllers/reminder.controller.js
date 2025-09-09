import prisma from "../utils/prisma.js";

import { sendOrderExpiryReminder } from "../utils/sendEmail.js";


export const sendExpiringOrderReminders = async (req, res) => {
  const today = new Date();
  const targetDate = new Date(today.setDate(today.getDate() + 3));

  try {
    const orders = await prisma.order.findMany({
      where: {
        status: "paid",
        endDate: {
          lte: targetDate,
          gte: new Date(),
        },
      },
      include: {
        billingInfo: true,
        user: true,
      },
    });

    for (const order of orders) {
      const to = order.user?.email || order.billingInfo?.email;
      if (to) {
        await sendOrderExpiryReminder(to, order);
        console.log(`📧 Hatırlatma gönderildi: ${to}`);
      }
    }

    res.status(200).json({ message: `${orders.length} kullanıcıya e-posta gönderildi.` });
  } catch (err) {
    console.error("❌ Hatırlatma gönderim hatası:", err);
    res.status(500).json({ message: "Hata oluştu." });
  }
};
