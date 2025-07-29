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
export const sendPaymentSuccessEmail = async (to, order) => {
  const discounted = order.discountRate > 0;

  const html = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <table width="100%" style="max-width: 600px; margin: auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding: 24px; text-align: center;">
          <h2 style="color: #10b981; margin: 0;">Ödemeniz Alındı 🎉</h2>
          <p style="color: #555; margin: 8px 0 0;">Teşekkür ederiz, <strong>${order.billingInfo.name} ${order.billingInfo.surname}</strong></p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 24px 24px;">
          <div style="background: #ecfdf5; border: 1px solid #d1fae5; padding: 16px; border-radius: 8px;">
            <p><strong>📦 Sipariş No:</strong> #${order.id}</p>
            <p><strong>🎁 Paket:</strong> ${order.package}</p>
            <p><strong>📅 Geçerlilik:</strong> ${new Date(order.startDate).toLocaleDateString()} - ${new Date(order.endDate).toLocaleDateString()}</p>
            ${discounted ? `
              <p><strong>💳 Kupon:</strong> ${order.couponCode} (%${order.discountRate})</p>
              <p><strong>💰 İndirimsiz Tutar:</strong> <del>${order.originalPrice.toFixed(2)} TL</del></p>
              <p><strong>💰 İndirimli Tutar:</strong> ${order.totalPrice.toFixed(2)} TL</p>
            ` : `
              <p><strong>💰 Ödenen Tutar:</strong> ${order.totalPrice.toFixed(2)} TL</p>
            `}
          </div>

          <div style="margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">
              Siparişiniz başarıyla tamamlandı ve hesabınıza tanımlandı. Herhangi bir sorunuz olursa destek ekibimizle iletişime geçebilirsiniz.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://sozderecekocluk.com/siparislerim" style="background-color: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Siparişlerimi Görüntüle</a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #999;">
          © ${new Date().getFullYear()} SözDerece. Tüm hakları saklıdır.
        </td>
      </tr>
    </table>
  </div>
  `;

  await sendEmail({
    to,
    subject: "📦 Siparişiniz Alındı – Teşekkür Ederiz!",
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
    <p>Bu kod 5 dakika için geçerlidir.</p>
  `;

  await sendEmail({
    to,
    subject: "🔐 Doğrulama Kodunuz",
    html,
  });
};


export const sendPasswordResetEmail = async (to, resetUrl) => {
  const html = `
    <h2>🔐 Şifre Sıfırlama</h2>
    <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>Bu bağlantı 15 dakika boyunca geçerlidir.</p>
  `;

  await sendEmail({
    to,
    subject: "🔐 Şifre Sıfırlama Bağlantısı",
    html,
  });
};

export const sendCoachAssignmentToStudent = async (to, coach) => {
  const html = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <table width="100%" style="max-width: 600px; margin: auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding: 24px; text-align: center;">
          <h2 style="color: #3b82f6; margin: 0;">🎓 Yeni Koç Atamanız</h2>
          <p style="color: #555;">Size bir koç atandı!</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 24px 24px;">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px;">
            <p><strong>👤 Koç Adı:</strong> ${coach.name}</p>
            <p><strong>📘 Branş:</strong> ${coach.subject || "Belirtilmedi"}</p>
          </div>
          <div style="margin-top: 20px; color: #555; font-size: 14px;">
            <p>Artık çalışmalarınızı destekleyecek bir koçunuz var. İhtiyacınız oldukça iletişim kurmaktan çekinmeyin.</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #999;">
          © ${new Date().getFullYear()} SözDerece. Tüm hakları saklıdır.
        </td>
      </tr>
    </table>
  </div>
  `;

  await sendEmail({
    to,
    subject: "🎓 Yeni Koç Atamanız",
    html,
  });
};


export const sendStudentAssignmentToCoach = async (to, student) => {
  const html = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <table width="100%" style="max-width: 600px; margin: auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding: 24px; text-align: center;">
          <h2 style="color: #10b981; margin: 0;">👨‍🎓 Yeni Öğrenci Ataması</h2>
          <p style="color: #555;">Size yeni bir öğrenci atandı.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 24px 24px;">
          <div style="background: #ecfdf5; border: 1px solid #d1fae5; padding: 16px; border-radius: 8px;">
            <p><strong>👤 Öğrenci Adı:</strong> ${student.name}</p>
            <p><strong>📧 E-Posta:</strong> ${student.email}</p>
          </div>
          <div style="margin-top: 20px; color: #555; font-size: 14px;">
            <p>Öğrenciyle iletişim kurarak ders planınızı oluşturabilirsiniz. Başarılar dileriz!</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #999;">
          © ${new Date().getFullYear()} SözDerece. Tüm hakları saklıdır.
        </td>
      </tr>
    </table>
  </div>
  `;

  await sendEmail({
    to,
    subject: "👨‍🎓 Yeni Öğrenci Ataması",
    html,
  });
};
