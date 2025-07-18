import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Genel e-posta gönderici
 */
export const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"SözDerece" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("❌ E-posta gönderilemedi:", error.message);
  }
};

/**
 * Ödeme başarı maili
 */
export const sendPaymentSuccessEmail = async (to, orderId) => {
  const html = `
    <h2>🎉 Siparişiniz Başarıyla Tamamlandı!</h2>
    <p>Merhaba,</p>
    <p>#${orderId} numaralı siparişinizin ödemesi başarıyla alındı.</p>
    <p>Destek ekibimiz en kısa sürede sizinle iletişime geçecektir.</p>
    <hr />
    <p>Teşekkür ederiz.<br/>SözDerece Ekibi</p>
  `;

  await sendEmail({
    to,
    subject: "📦 Ödeme Başarılı - Sipariş Onayı",
    html,
  });
};

/**
 * Doğrulama kodu gönderimi
 */
export const sendVerificationEmail = async (to, code) => {
  const html = `
    <p>Merhaba,</p>
    <p>Doğrulama kodunuz: <strong>${code}</strong></p>
    <p>Bu kod 5 dakika içinde geçerlidir.</p>
  `;

  await sendEmail({
    to,
    subject: "🔐 Doğrulama Kodunuz",
    html,
  });
};


export const sendPasswordResetEmail = async (to, resetUrl) => {
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

    await transporter.sendMail({
      from: `"SözDerece" <${process.env.EMAIL_USER}>`,
      to,
      subject: "🔐 Şifre Sıfırlama Bağlantısı",
      html: `
        <h2>Şifrenizi sıfırlamak için bağlantıya tıklayın</h2>
        <p><a href="${resetUrl}">Şifreyi Sıfırla</a></p>
        <p>Bu bağlantı 15 dakika boyunca geçerlidir.</p>
      `,
    });
  } catch (err) {
    console.error("❌ Şifre sıfırlama maili gönderilemedi:", err);
  }
};
