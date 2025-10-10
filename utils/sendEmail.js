import nodemailer from "nodemailer";

const PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Opsiyonel: sunucu boot'ta doğrulama logu
transporter.verify().then(() => {
  console.log("✅ SMTP transporter ready");
}).catch(err => {
  console.error("❌ SMTP verify failed:", err?.message || err);
});

/**
 * Genel e-posta gönderici
 */
export const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Sözderece" <${process.env.EMAIL_USER}>`,
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
            <p><strong> Sipariş No:</strong> #${order.id}</p>
            <p><strong> Paket İsmi:</strong> ${order.package}</p>
            <p><strong>  Geçerlilik Tarihi:</strong> ${new Date(order.startDate).toLocaleDateString()} - ${new Date(order.endDate).toLocaleDateString()}</p>
            ${discounted ? `
              <p><strong> Kupon:</strong> ${order.couponCode} (%${order.discountRate})</p>
              <p><strong> İndirimsiz Tutar:</strong> <del>${order.originalPrice.toFixed(2)} TL</del></p>
              <p><strong> İndirimli Tutar:</strong> ${order.totalPrice.toFixed(2)} TL</p>
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
    <h2>Şifre Sıfırlama</h2>
    <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>Bu bağlantı 15 dakika boyunca geçerlidir.</p>
  `;

  await sendEmail({
    to,
    subject: "Şifre Sıfırlama Bağlantısı",
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
            <p><strong>📧 E-posta:</strong> ${coach.user?.email || "Belirtilmedi"}</p>
          </div>
          <div style="margin-top: 20px; color: #555; font-size: 14px;">
            <p>Artık çalışmalarınızı destekleyecek bir koçunuz var.</p>
            <p><strong>Koçunuzla ilgili tüm bilgilere öğrenci panelinden ulaşabilirsiniz.</strong></p>
          <p><strong>Sözderece Koçluk'u tercih ettiğiniz için teşekkür ederiz.</strong></p>
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
            <p>Koç panelinden öğrenciyle alakalı bilgileri görüntüleyip iletişim kurarabilir, ilk görüşmenizi oluşturabilirsiniz. İyi çalışmalar dileriz!</p>
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


export const sendOrderExpiryReminder = async (to, order) => {
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #fefce8; padding: 20px;">
      <table width="100%" style="max-width: 600px; margin: auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <tr>
          <td style="padding: 24px; text-align: center;">
            <h2 style="color: #f59e0b; margin: 0;">⏳ Süre Dolmak Üzere</h2>
            <p style="color: #555;">Siparişinizin süresi yakında sona eriyor.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 24px 24px;">
            <div style="background: #fef3c7; border: 1px solid #fde68a; padding: 16px; border-radius: 8px;">
              <p><strong>Paket:</strong> ${order.package}</p>
              <p><strong>Bitiş Tarihi:</strong> ${new Date(order.endDate).toLocaleDateString()}</p>
            </div>
            <div style="margin-top: 20px; text-align: center;">
              <a href="https://sozderecekocluk.com/paketler" style="background-color: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Paketi Yenile</a>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;

  await sendEmail({
    to,
    subject: "⏳ Sipariş Süreniz Bitmek Üzere",
    html,
  });
};



/** 🆕 Öğretmene “yeni talep” bildirimi */
export async function sendNewRequestToTeacher(to, payload = {}) {
  const {
    teacherName,
    studentName,
    studentEmail,
    studentPhone,
    subject,
    grade,
    modeLabel,        // "Online" | "Yüz yüze"
    packageTitle,     // varsa
    lessonsCount,     // varsa
    note,             // öğrencinin notu
    requestId,
    createdAt,
    panelUrl = "https://sozderecekocluk.com/ogretmen/panel",
  } = payload;

  const html = `
  <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:20px;">
    <table width="100%" style="max-width:600px; margin:auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr>
        <td style="padding:24px; text-align:center;">
          <h2 style="margin:0; color:#111827;">🆕 Yeni Ders Talebi</h2>
          <p style="margin:8px 0 0; color:#6b7280;">${teacherName ? `${teacherName}, ` : ""}size yeni bir talep ulaştı.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px;">
          <div style="background:#f3f4f6; border:1px solid #e5e7eb; padding:16px; border-radius:8px;">
            <p style="margin:0 0 6px;"><strong>📅 Talep Zamanı:</strong> ${new Date(createdAt || Date.now()).toLocaleString("tr-TR")}</p>
            ${requestId ? `<p style="margin:0 0 6px;"><strong>🆔 Talep No:</strong> #${requestId}</p>` : ""}
            <p style="margin:0 0 6px;"><strong>📚 Ders:</strong> ${subject || "—"}</p>
            <p style="margin:0 0 6px;"><strong>🎓 Seviye:</strong> ${grade || "—"}</p>
            <p style="margin:0 0 6px;"><strong>🧭 Tür:</strong> ${modeLabel || "—"}</p>
            ${(packageTitle || lessonsCount) ? `<p style="margin:0 0 6px;"><strong>🏷️ Paket:</strong> ${packageTitle || "—"} ${lessonsCount ? `(${lessonsCount} ders)` : ""}</p>` : ""}
          </div>

          <div style="margin-top:14px; background:#ecfeff; border:1px solid #a5f3fc; padding:16px; border-radius:8px;">
            <p style="margin:0 0 6px;"><strong>👤 Öğrenci:</strong> ${studentName || "Öğrenci"}</p>
            <p style="margin:0 0 6px;"><strong>📧 E-posta:</strong> ${studentEmail || "—"}</p>
            <p style="margin:0;"><strong>📞 Telefon:</strong> ${studentPhone || "—"}</p>
          </div>

          ${note ? `
            <div style="margin-top:14px; background:#fefce8; border:1px solid #fde68a; padding:16px; border-radius:8px;">
              <p style="margin:0 0 6px; color:#7c6d00;"><strong>📝 Öğrenci Notu:</strong></p>
              <p style="margin:0; white-space:pre-wrap; color:#7c6d00;">${note}</p>
            </div>` : ""
          }

          <div style="text-align:center; margin-top:22px;">
            <a href="${panelUrl}" style="display:inline-block; background:#10b981; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">
              Öğretmen Paneline Git
            </a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f3f4f6; padding:12px; text-align:center; color:#9ca3af; font-size:12px;">
          © ${new Date().getFullYear()} SözDerece • Bu bir bilgilendirme mesajıdır.
        </td>
      </tr>
    </table>
  </div>`;

  await sendEmail({ to, subject: "🆕 Yeni Ders Talebi Var", html });
}



export async function sendAppointmentConfirmedToStudent(to, payload = {}) {
  const {
    studentName = "",
    teacherName = "",
    subject = "",
    grade = "",
    modeLabel = "",           // "Online" | "Yüz yüze"
    startsAt,                 // Date or ISO
    endsAt,                   // Date or ISO
    panelUrl = "https://sozderecekocluk.com/ogrenci/panel",
  } = payload;

  const when =
    startsAt && endsAt
      ? `${new Date(startsAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })} – ${new Date(endsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
      : "Planlanan saat";

  const html = `
  <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:20px;">
    <table width="100%" style="max-width:600px; margin:auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr>
        <td style="padding:24px; text-align:center;">
          <h2 style="margin:0; color:#111827;">✅ Talebiniz Onaylandı</h2>
          <p style="margin:8px 0 0; color:#6b7280;">${studentName ? `${studentName}, ` : ""}randevunuz onaylandı.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px;">
          <div style="background:#ecfdf5; border:1px solid #bbf7d0; padding:16px; border-radius:8px;">
            <p style="margin:0 0 6px;"><strong>👨‍🏫 Öğretmen:</strong> ${teacherName || "Öğretmen"}</p>
            <p style="margin:0 0 6px;"><strong>📚 Ders:</strong> ${subject || "—"} ${grade ? `(${grade})` : ""}</p>
            <p style="margin:0 0 6px;"><strong>🧭 Tür:</strong> ${modeLabel || "—"}</p>
            <p style="margin:0;"><strong>🗓 Tarih/Saat:</strong> ${when}</p>
          </div>

          <div style="text-align:center; margin-top:22px;">
            <a href="${panelUrl}" style="display:inline-block; background:#10b981; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">
              Öğrenci Panelini Aç
            </a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f3f4f6; padding:12px; text-align:center; color:#9ca3af; font-size:12px;">
          © ${new Date().getFullYear()} SözDerece • Bu bir bilgilendirme mesajıdır.
        </td>
      </tr>
    </table>
  </div>`;
  await sendEmail({ to, subject: "✅ Talebiniz Onaylandı", html });
}