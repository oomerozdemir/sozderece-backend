import cron from "node-cron";
import prisma from "../utils/prisma.js";

import { sendEmail, emailShell } from "../utils/sendEmail.js";


const FRONTEND_URL = process.env.FRONTEND_URL || "https://sozderecekocluk.com";
const TZ = "Europe/Istanbul";

// Her saat başı, İstanbul saatine göre
cron.schedule("0 * * * *", async () => {
  console.log("🕒 Abandoned cart kontrolü başladı");
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Yalnızca hiç mail gitmemiş (reminderStep=0) ve 12+ saatlik sepetler.
    // Giriş yapmış kullanıcı sepetlerinde Cart.email hep null kalıyor
    // (bkz. cart.controller.js#addToCart) — bu yüzden email VEYA userId
    // dolu olan sepetlerin ikisi de kapsanıyor.
    const abandonedCarts = await prisma.cart.findMany({
      where: {
        completed: false,
        reminderStep: 0,               // <— tekrarı engeller
        createdAt: { lte: twelveHoursAgo },
        OR: [{ email: { not: null } }, { userId: { not: null } }],
      },
      include: { items: true, user: true },
    });

    for (const cart of abandonedCarts) {
      const to = cart.email || cart.user?.email;
      if (!to) continue;

      // CartItem'da 'title' var
      const itemsRows = cart.items
        .map(
          (i) => `
            <tr>
              <td style="padding:8px 0; font-size:14px; color:#1e1b3a;">${i.title}</td>
            </tr>`
        )
        .join("");

      const htmlContent = emailShell({
        eyebrow: "Sepetin Seni Bekliyor",
        title: "Bıraktığın ürünler hâlâ orada 🚀",
        subtitle: "Sepetindeki yerini kaybetmeden şimdi tamamla.",
        bodyHtml: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fa; border:1px solid #eeeaf7; border-radius:14px; padding:4px 18px; margin:14px 0;">
            ${itemsRows || `<tr><td style="padding:8px 0; font-size:14px; color:#1e1b3a;">Seçili ürün(ler)</td></tr>`}
          </table>
          <p style="font-size:12px; color:#a3a0b8; text-align:center; margin-top:18px;">Bu maili yanlışlıkla aldıysanız dikkate almayabilirsiniz.</p>
        `,
        ctaLabel: "Sepetime Git →",
        ctaUrl: `${FRONTEND_URL}/sepet`,
      });

      // mail gönder
      await sendEmail({
        to,
        subject: "Sepetiniz sizi bekliyor 🚀",
        html: htmlContent,
      });

      // tekrar göndermemek için step'i artır
      await prisma.cart.update({
        where: { id: cart.id },
        data: { reminderStep: 1 }
      });

      console.log(`📧 HTML hatırlatma maili gönderildi ve işaretlendi: ${to}`);
    }
  } catch (err) {
    console.error("❌ Abandoned cart cron hatası:", err);
  }
}, { timezone: TZ });
