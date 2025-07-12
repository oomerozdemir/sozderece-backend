import nodemailer from "nodemailer";

export const sendPaymentSuccessEmail = async (to, orderId) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"SözDerece" <${process.env.EMAIL_USER}>`,
      to,
      subject: "📦 Ödeme Başarılı - Sipariş Onayı",
      html: `
        <h2>🎉 Siparişiniz Başarıyla Tamamlandı!</h2>
        <p>Merhaba,</p>
        <p>#${orderId} numaralı siparişinizin ödemesi başarıyla alındı.</p>
        <p>Destek ekibimiz en kısa sürede sizinle iletişime geçecektir.</p>
        <hr />
        <p>Teşekkür ederiz.<br/>SözDerece Ekibi</p>
      `,
    });

    console.log("✅ E-posta gönderildi:", info.messageId);
  } catch (error) {
    console.error("❌ E-posta gönderim hatası:", error.message);
  }
};
