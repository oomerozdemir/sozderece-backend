// sendEmail.js — Resend entegrasyonu (SMTP yerine HTTPS API)
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
// Gönderen adresinizi Resend panelinde doğruladığınız bir adres yapın
const FROM =
  process.env.EMAIL_FROM ||
  process.env.EMAIL_USER || // geriye dönük uyumluluk
  "noreply@sozderecekocluk.com";

/**
 * Genel e-posta gönderici
 * @param {{to: string|string[], subject: string, html: string}} param0
 */
export const sendEmail = async ({ to, subject, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (error) {
      const msg =
        error?.message ||
        (Array.isArray(error) ? error.map(e => e.message).join("; ") : "Bilinmeyen hata");
      console.error("❌ E-posta gönderilemedi:", msg);
      throw new Error(msg);
    }
    // console.log("✅ Mail sent:", data?.id);
    return data;
  } catch (err) {
    console.error("❌ E-posta gönderilemedi:", err?.message || err);
    throw err;
  }
};

/* ============================================================
   Marka şablonu — sitenin renk paletiyle (lacivert #100481,
   turuncu #FF6B35, lime #D8FF4F) tüm e-postalarda tek, tutarlı
   bir görünüm sağlar. Her e-posta kendi içeriğini bu kabuğa verir.
============================================================ */

const BRAND = {
  navy: "#100481",
  navyDark: "#0D0A2E",
  orange: "#FF6B35",
  lime: "#D8FF4F",
  textDark: "#1e1b3a",
  textMuted: "#6b7280",
  bgPage: "#f4f2fa",
  bgCard: "#ffffff",
  border: "#eeeaf7",
};

/**
 * Markalı e-posta kabuğu (header + gövde + opsiyonel CTA + footer).
 * @param {{eyebrow?:string, title:string, subtitle?:string, bodyHtml:string, ctaLabel?:string, ctaUrl?:string}} opts
 */
export function emailShell({ eyebrow, title, subtitle, bodyHtml, ctaLabel, ctaUrl }) {
  return `
  <div style="background:${BRAND.bgPage}; padding:32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:${BRAND.bgCard}; border-radius:20px; overflow:hidden; box-shadow:0 8px 30px rgba(16,4,129,0.08);">
      <tr>
        <td style="background:${BRAND.navy}; padding:26px 32px; text-align:center;">
          <div style="font-weight:800; font-size:22px; letter-spacing:1.5px; color:${BRAND.lime};">SÖZDERECE</div>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 32px 4px; text-align:center;">
          ${eyebrow ? `<div style="font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${BRAND.orange}; margin-bottom:10px;">${eyebrow}</div>` : ""}
          <h1 style="margin:0; font-size:22px; line-height:1.3; color:${BRAND.navyDark};">${title}</h1>
          ${subtitle ? `<p style="margin:10px 0 0; font-size:14px; color:${BRAND.textMuted};">${subtitle}</p>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 4px;">
          ${bodyHtml}
        </td>
      </tr>
      ${
        ctaUrl
          ? `<tr>
              <td style="padding:12px 32px 32px; text-align:center;">
                <a href="${ctaUrl}" style="display:inline-block; background:${BRAND.orange}; color:#ffffff; text-decoration:none; font-weight:700; font-size:15px; padding:14px 30px; border-radius:999px;">${ctaLabel}</a>
              </td>
            </tr>`
          : `<tr><td style="height:24px;"></td></tr>`
      }
      <tr>
        <td style="background:#faf9fd; padding:18px 32px; text-align:center; border-top:1px solid ${BRAND.border};">
          <p style="margin:0; font-size:12px; color:#a3a0b8;">© ${new Date().getFullYear()} Sözderece Koçluk · sozderecekocluk.com</p>
        </td>
      </tr>
    </table>
  </div>`;
}

/**
 * Etiket/değer satırlarından oluşan bilgi kartı (email-safe: table tabanlı,
 * flexbox kullanmıyor — Outlook gibi istemcilerde de doğru render olur).
 * @param {[string, string][]} rows
 */
export function infoCard(rows, opts = {}) {
  const { bg = BRAND.bgPage, border = BRAND.border } = opts;
  const rowsHtml = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:7px 0; font-size:13px; color:${BRAND.textMuted}; white-space:nowrap;">${label}</td>
        <td style="padding:7px 0; font-size:14px; color:${BRAND.textDark}; font-weight:700; text-align:right;">${value}</td>
      </tr>`
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}; border:1px solid ${border}; border-radius:14px; padding:2px 18px; margin:14px 0;">
      ${rowsHtml}
    </table>`;
}

/**
 * Uyarı/not kutusu (ör. öğrenci notu, önemli hatırlatma).
 */
export function noteCard(text, opts = {}) {
  const { bg = "#fef6e7", border = "#f6e2b3", textColor = "#8a6d1f" } = opts;
  return `
    <div style="background:${bg}; border:1px solid ${border}; border-radius:14px; padding:14px 18px; margin:14px 0; font-size:13px; color:${textColor}; line-height:1.6; white-space:pre-wrap;">
      ${text}
    </div>`;
}

/**
 * Ödeme başarı maili
 */
export const sendPaymentSuccessEmail = async (to, order) => {
  const discounted = order.discountRate > 0;

  const rows = [
    ["Sipariş No", `#${order.id}`],
    ["Paket", order.package],
    [
      "Geçerlilik",
      `${new Date(order.startDate).toLocaleDateString("tr-TR")} – ${new Date(order.endDate).toLocaleDateString("tr-TR")}`,
    ],
  ];
  if (discounted) {
    rows.push(["Kupon", `${order.couponCode} (%${order.discountRate})`]);
    rows.push([
      "İndirimsiz Tutar",
      `<span style="text-decoration:line-through; color:#a3a0b8; font-weight:600;">${order.originalPrice.toFixed(2)} TL</span>`,
    ]);
    rows.push(["Ödenen Tutar", `${order.totalPrice.toFixed(2)} TL`]);
  } else {
    rows.push(["Ödenen Tutar", `${order.totalPrice.toFixed(2)} TL`]);
  }

  const html = emailShell({
    eyebrow: "Ödeme Onaylandı",
    title: "Siparişiniz alındı 🎉",
    subtitle: `Teşekkürler, ${order.billingInfo.name} ${order.billingInfo.surname}`,
    bodyHtml: `
      ${infoCard(rows, { bg: "#eafaf0", border: "#c9f0da" })}
      <p style="font-size:14px; color:${BRAND.textMuted}; line-height:1.6; margin:16px 0 0;">
        Siparişiniz başarıyla tamamlandı ve hesabınıza tanımlandı. Herhangi bir sorunuz olursa destek ekibimizle iletişime geçebilirsiniz.
      </p>`,
    ctaLabel: "Siparişlerimi Görüntüle",
    ctaUrl: "https://sozderecekocluk.com/orders",
  });

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
  const html = emailShell({
    eyebrow: "Güvenlik",
    title: "Doğrulama kodunuz",
    bodyHtml: `
      <div style="text-align:center; margin:18px 0;">
        <span style="display:inline-block; background:${BRAND.bgPage}; border:1px dashed #c9c2e8; border-radius:12px; padding:16px 28px; font-size:30px; font-weight:800; letter-spacing:9px; color:${BRAND.navy};">${code}</span>
      </div>
      <p style="font-size:13px; color:${BRAND.textMuted}; text-align:center; line-height:1.6;">
        Bu kod <strong>5 dakika</strong> için geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.
      </p>`,
  });

  await sendEmail({
    to,
    subject: "🔐 Doğrulama Kodunuz",
    html,
  });
};

export const sendPasswordResetEmail = async (to, resetUrl) => {
  const html = emailShell({
    eyebrow: "Hesap Güvenliği",
    title: "Şifreni sıfırla",
    subtitle: "Aşağıdaki butona tıklayarak yeni bir şifre belirleyebilirsin.",
    bodyHtml: `
      <p style="font-size:12.5px; color:#a3a0b8; text-align:center; word-break:break-all; margin:18px 0 0;">
        Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:<br/>
        <a href="${resetUrl}" style="color:${BRAND.navy};">${resetUrl}</a>
      </p>
      <p style="font-size:13px; color:${BRAND.textMuted}; text-align:center;">Bu bağlantı 15 dakika boyunca geçerlidir.</p>`,
    ctaLabel: "Şifremi Sıfırla",
    ctaUrl: resetUrl,
  });

  await sendEmail({
    to,
    subject: "Şifre Sıfırlama Bağlantısı",
    html,
  });
};

export const sendCoachWelcomeEmail = async (to, { name, tempPassword }) => {
  const html = emailShell({
    eyebrow: "Koç Hesabı",
    title: `Hoş geldin${name ? `, ${name}` : ""}!`,
    subtitle: "Sözderece Koçluk ekibine katıldın — hesabın oluşturuldu.",
    bodyHtml: `
      ${infoCard([["E-posta", to], ["Geçici Şifre", tempPassword]], { bg: "#eef1fd", border: "#d6ddf7" })}
      <p style="font-size:14px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        Bu geçici şifreyle giriş yaptıktan sonra, güvenliğin için ilk fırsatta şifreni değiştirmeni öneririz.
      </p>`,
    ctaLabel: "Giriş Yap",
    ctaUrl: "https://sozderecekocluk.com/giris-yap",
  });

  await sendEmail({
    to,
    subject: "Sözderece Koçluk — Hesabın Hazır",
    html,
  });
};

export const sendCoachAssignmentToStudent = async (to, coach) => {
  const html = emailShell({
    eyebrow: "Koçluk",
    title: "Sana bir koç atandı 🎓",
    bodyHtml: `
      ${infoCard([["Koç Adı", coach.name], ["E-posta", coach.user?.email || "Belirtilmedi"]], { bg: "#eef1fd", border: "#d6ddf7" })}
      <p style="font-size:14px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        Artık çalışmalarını destekleyecek bir koçun var. Koçunla ilgili tüm bilgilere öğrenci panelinden ulaşabilirsin.
      </p>
      <p style="font-size:14px; color:${BRAND.textMuted};">Sözderece Koçluk'u tercih ettiğin için teşekkür ederiz.</p>`,
    ctaLabel: "Öğrenci Panelime Git",
    ctaUrl: "https://sozderecekocluk.com/student/dashboard",
  });

  await sendEmail({
    to,
    subject: "🎓 Yeni Koç Atamanız",
    html,
  });
};

export const sendStudentAssignmentToCoach = async (to, student) => {
  const html = emailShell({
    eyebrow: "Koçluk",
    title: "Yeni bir öğrenci atandı 👨‍🎓",
    bodyHtml: `
      ${infoCard([["Öğrenci Adı", student.name], ["E-Posta", student.email]], { bg: "#eafaf0", border: "#c9f0da" })}
      <p style="font-size:14px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        Koç panelinden öğrenciyle alakalı bilgileri görüntüleyip iletişim kurabilir, ilk görüşmenizi oluşturabilirsiniz. İyi çalışmalar dileriz!
      </p>`,
    ctaLabel: "Koç Panelime Git",
    ctaUrl: "https://sozderecekocluk.com/coach/dashboard",
  });

  await sendEmail({
    to,
    subject: "👨‍🎓 Yeni Öğrenci Ataması",
    html,
  });
};

export const sendOrderExpiryReminder = async (to, order) => {
  const html = emailShell({
    eyebrow: "Hatırlatma",
    title: "Süreniz dolmak üzere ⏳",
    subtitle: "Paketinizin süresi yakında sona eriyor.",
    bodyHtml: infoCard(
      [
        ["Paket", order.package],
        ["Bitiş Tarihi", new Date(order.endDate).toLocaleDateString("tr-TR")],
      ],
      { bg: "#fef6e7", border: "#f6e2b3" }
    ),
    ctaLabel: "Paketi Yenile",
    ctaUrl: "https://sozderecekocluk.com/paket-detay",
  });

  await sendEmail({
    to,
    subject: "⏳ Sipariş Süreniz Bitmek Üzere",
    html,
  });
};

/** Öğretmene "yeni talep" bildirimi */
export async function sendNewRequestToTeacher(to, payload = {}) {
  const {
    teacherName,
    studentName,
    studentEmail,
    studentPhone,
    subject,
    grade,
    modeLabel, // "Online" | "Yüz yüze"
    packageTitle, // varsa
    lessonsCount, // varsa
    note, // öğrencinin notu
    requestId,
    createdAt,
    panelUrl = "https://sozderecekocluk.com/ogretmen/panel/profil",
  } = payload;

  const rows = [
    ["Talep Zamanı", new Date(createdAt || Date.now()).toLocaleString("tr-TR")],
    requestId ? ["Talep No", `#${requestId}`] : null,
    ["Ders", subject || "—"],
    ["Seviye", grade || "—"],
    ["Tür", modeLabel || "—"],
    packageTitle || lessonsCount
      ? ["Paket", `${packageTitle || "—"}${lessonsCount ? ` (${lessonsCount} ders)` : ""}`]
      : null,
  ].filter(Boolean);

  const html = emailShell({
    eyebrow: "Yeni Talep",
    title: "Size yeni bir ders talebi ulaştı 🆕",
    subtitle: teacherName || undefined,
    bodyHtml: `
      ${infoCard(rows, { bg: BRAND.bgPage, border: BRAND.border })}
      ${infoCard(
        [
          ["Öğrenci", studentName || "Öğrenci"],
          ["E-posta", studentEmail || "—"],
          ["Telefon", studentPhone || "—"],
        ],
        { bg: "#eafbfd", border: "#c7eef4" }
      )}
      ${note ? noteCard(`<strong>Öğrenci Notu:</strong><br/>${note}`) : ""}
    `,
    ctaLabel: "Öğretmen Paneline Git",
    ctaUrl: panelUrl,
  });

  await sendEmail({ to, subject: "🆕 Yeni Ders Talebi Var", html });
}

export async function sendAppointmentConfirmedToStudent(to, payload = {}) {
  const {
    studentName = "",
    teacherName = "",
    subject = "",
    grade = "",
    modeLabel = "", // "Online" | "Yüz yüze"
    startsAt, // Date or ISO
    endsAt, // Date or ISO
    panelUrl = "https://sozderecekocluk.com/student/dashboard",
  } = payload;

  const when =
    startsAt && endsAt
      ? `${new Date(startsAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })} – ${new Date(endsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
      : "Planlanan saat";

  const html = emailShell({
    eyebrow: "Randevu Onaylandı",
    title: "Talebiniz onaylandı ✅",
    subtitle: studentName ? `${studentName}, randevunuz onaylandı.` : "Randevunuz onaylandı.",
    bodyHtml: infoCard(
      [
        ["Öğretmen", teacherName || "Öğretmen"],
        ["Ders", `${subject || "—"}${grade ? ` (${grade})` : ""}`],
        ["Tür", modeLabel || "—"],
        ["Tarih/Saat", when],
      ],
      { bg: "#eafaf0", border: "#c9f0da" }
    ),
    ctaLabel: "Öğrenci Panelini Aç",
    ctaUrl: panelUrl,
  });

  await sendEmail({ to, subject: "✅ Talebiniz Onaylandı", html });
}

/* ============================================================
   Abonelik (aylık otomatik ödeme) e-postaları
============================================================ */

export const sendSubscriptionStartedEmail = async (to, subscription) => {
  const html = emailShell({
    eyebrow: "Abonelik Başladı",
    title: "Aboneliğin aktif 🎉",
    subtitle: "Her ay otomatik olarak yenilenecek.",
    bodyHtml: `
      ${infoCard(
        [
          ["Paket", subscription.planLabel],
          ["Aylık Tutar", `${(subscription.amount / 100).toFixed(2)} TL`],
          ["Kayıtlı Kart", subscription.cardLast4 ? `•••• ${subscription.cardLast4}` : "—"],
          ["Sonraki Çekim", new Date(subscription.nextBillingDate).toLocaleDateString("tr-TR")],
        ],
        { bg: "#eafaf0", border: "#c9f0da" }
      )}
      <p style="font-size:13px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        Aboneliğini dilediğin zaman "Siparişlerim" sayfasından tek tıkla iptal edebilirsin — iptal ettiğinde
        o an ödediğin dönem sonuna kadar erişimin devam eder, bir sonraki ay tekrar çekim yapılmaz.
      </p>`,
    ctaLabel: "Aboneliğimi Görüntüle",
    ctaUrl: "https://sozderecekocluk.com/orders",
  });

  await sendEmail({ to, subject: "🎉 Aboneliğin Başladı", html });
};

export const sendSubscriptionPaymentFailedEmail = async (to, { subscription, attemptNumber, nextRetryDate }) => {
  const html = emailShell({
    eyebrow: "Ödeme Sorunu",
    title: "Aylık çekim gerçekleşmedi ⚠️",
    subtitle: "Kartında bir sorun olabilir (süre dolmuş, bakiye yetersiz vb.)",
    bodyHtml: `
      ${infoCard(
        [
          ["Paket", subscription.planLabel],
          ["Tutar", `${(subscription.amount / 100).toFixed(2)} TL`],
          ["Deneme", `${attemptNumber}. deneme`],
          nextRetryDate ? ["Sonraki Deneme", new Date(nextRetryDate).toLocaleDateString("tr-TR")] : null,
        ].filter(Boolean),
        { bg: "#fef6e7", border: "#f6e2b3" }
      )}
      <p style="font-size:13px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        ${nextRetryDate
          ? "Kartını güncel tutarsan otomatik olarak tekrar deneyeceğiz. Sorun devam ederse aboneliğin duraklatılabilir."
          : "Tüm otomatik deneme haklarımız tükendi, aboneliğin iptal edildi. Devam etmek istersen yeniden başlatabilirsin."}
      </p>`,
    ctaLabel: "Ödeme Bilgilerimi Güncelle",
    ctaUrl: "https://sozderecekocluk.com/orders",
  });

  await sendEmail({ to, subject: "⚠️ Aylık Ödemen Alınamadı", html });
};

export const sendSubscriptionCancelledEmail = async (to, subscription) => {
  const html = emailShell({
    eyebrow: "Abonelik Sona Erdi",
    title: "Aboneliğin iptal edildi",
    bodyHtml: `
      ${infoCard(
        [
          ["Paket", subscription.planLabel],
          ["Son Erişim Tarihi", new Date(subscription.currentPeriodEnd).toLocaleDateString("tr-TR")],
        ],
        { bg: BRAND.bgPage, border: BRAND.border }
      )}
      <p style="font-size:13px; color:${BRAND.textMuted}; line-height:1.6; margin-top:14px;">
        Bundan sonra kartından herhangi bir çekim yapılmayacak. Fikrini değiştirirsen aynı paketi istediğin zaman yeniden başlatabilirsin.
      </p>`,
    ctaLabel: "Paketlere Göz At",
    ctaUrl: "https://sozderecekocluk.com/paket-detay",
  });

  await sendEmail({ to, subject: "Aboneliğin İptal Edildi", html });
};
