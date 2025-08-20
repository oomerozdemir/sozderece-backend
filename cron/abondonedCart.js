import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../utils/sendEmail.js"; 

const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL || "https://sozderecekocluk.com";
const TZ = "Europe/Istanbul";

// Her saat başı, İstanbul saatine göre
cron.schedule("0 * * * *", async () => {
  console.log("🕒 Abandoned cart kontrolü başladı");
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Yalnızca hiç mail gitmemiş (reminderStep=0) ve 12+ saatlik sepetler
    const abandonedCarts = await prisma.cart.findMany({
      where: {
        completed: false,
        reminderStep: 0,               // <— tekrarı engeller
        createdAt: { lte: twelveHoursAgo },
        email: { not: null }
      },
      include: { items: true },
    });

    for (const cart of abandonedCarts) {
      if (!cart.email) continue;

      // CartItem'da 'title' var
      const itemsList = cart.items
        .map(i => `<li style="margin-bottom:8px;">${i.title}</li>`)
        .join("");

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Sepetiniz Sizi Bekliyor 🚀</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#4f46e5; color:#ffffff; padding:20px; text-align:center;">
              <h1 style="margin:0; font-size:22px;">Sepetinizde Ürünler Sizi Bekliyor</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px; color:#333;">
              <p>Merhaba,</p>
              <p>Sepetinizde bıraktığınız ürünler hâlâ sizi bekliyor 👇</p>
              <ul style="padding-left:20px; font-size:16px; line-height:1.6;">
                ${itemsList || "<li>Seçili ürün(ler)</li>"}
              </ul>
              <p>Şimdi geri dönün ve alışverişinizi kolayca tamamlayın!</p>
              <div style="text-align:center; margin:30px 0;">
                <a href="${FRONTEND_URL}/cart"
                  style="background:#4f46e5; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:6px; font-size:16px; font-weight:bold;">
                  Sepetime Git →
                </a>
              </div>
              <p style="font-size:12px; color:#777;">Bu maili yanlışlıkla aldıysanız dikkate almayabilirsiniz.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f3f4f6; color:#666; font-size:12px; padding:15px; text-align:center;">
              © ${new Date().getFullYear()} Senin Şirketin. Tüm hakları saklıdır.
            </td>
          </tr>
        </table>
      </body>
      </html>
      `;

      // mail gönder
      await sendEmail({
        to: cart.email,
        subject: "Sepetiniz sizi bekliyor 🚀",
        html: htmlContent,
      });

      // tekrar göndermemek için step'i artır
      await prisma.cart.update({
        where: { id: cart.id },
        data: { reminderStep: 1 }
      });

      console.log(`📧 HTML hatırlatma maili gönderildi ve işaretlendi: ${cart.email}`);
    }
  } catch (err) {
    console.error("❌ Abandoned cart cron hatası:", err);
  }
}, { timezone: TZ });
