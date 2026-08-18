// UTM + referrer sinyallerinden okunabilir bir "kanal" özeti üretir.
// Amaç ikas'takine benzer bir başlık kurmak: "Instagram reklamları ile
// oluşturulmuştur." gibi. `icon` alanı frontend'de react-icons/fa eşlemesi
// için bir anahtar döner (yeni bağımlılık gerektirmez).

const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta"]);

const SOURCE_LABELS = {
  google: { label: "Google", icon: "google" },
  adwords: { label: "Google", icon: "google" },
  googleads: { label: "Google", icon: "google" },
  tiktok: { label: "TikTok", icon: "tiktok" },
  whatsapp: { label: "WhatsApp", icon: "whatsapp" },
  email: { label: "E-posta", icon: "email" },
  newsletter: { label: "E-posta", icon: "email" },
};

const MEDIUM_SUFFIX = {
  cpc: "reklamları ile",
  ppc: "reklamları ile",
  paid: "reklamları ile",
  paidsocial: "reklamları ile",
  ads: "reklamları ile",
  social: "gönderisi ile",
  organic: "organik araması ile",
  email: "e-postası ile",
  referral: "yönlendirmesi ile",
};

const REFERRAL_DOMAINS = [
  { test: (d) => d.includes("instagram.com"), label: "Instagram", icon: "instagram" },
  { test: (d) => d.includes("facebook.com") || d.includes("fb.com"), label: "Facebook", icon: "facebook" },
  { test: (d) => d.includes("google."), label: "Google", icon: "google" },
  { test: (d) => d.includes("tiktok.com"), label: "TikTok", icon: "tiktok" },
  { test: (d) => d.includes("t.co") || d.includes("twitter.com") || d.includes("x.com"), label: "X (Twitter)", icon: "x" },
  { test: (d) => d.includes("whatsapp.com") || d.includes("wa.me"), label: "WhatsApp", icon: "whatsapp" },
  { test: (d) => d.includes("youtube.com"), label: "YouTube", icon: "youtube" },
];

export function classifyChannel({ utmSource, utmMedium, referrerDomain }) {
  const source = (utmSource || "").toLowerCase().trim();
  const medium = (utmMedium || "").toLowerCase().trim();
  const domain = (referrerDomain || "").toLowerCase().trim();

  if (source && META_SOURCES.has(source)) {
    // Meta reklamları hem Facebook hem Instagram'da yayınlanabilir; Ads Manager
    // ikisi için de genelde utm_source=facebook döner — gerçek platformu
    // ayırt eden asıl sinyal referrer domain'i (l.instagram.com vs l.facebook.com).
    const isInstagram = source === "instagram" || source === "ig" || domain.includes("instagram.com");
    const label = isInstagram ? "Instagram" : "Facebook";
    const icon = isInstagram ? "instagram" : "facebook";
    const suffix = MEDIUM_SUFFIX[medium] || "reklamları ile";
    return {
      key: `meta_${label.toLowerCase()}_${medium || "unknown"}`,
      label,
      icon,
      headline: `${label} ${suffix} oluşturulmuştur.`,
    };
  }

  if (source) {
    const known = SOURCE_LABELS[source];
    const label = known?.label || utmSource;
    const icon = known?.icon || "referral";
    const suffix = MEDIUM_SUFFIX[medium] || "ile";
    return {
      key: `${source}_${medium || "unknown"}`,
      label,
      icon,
      headline: `${label} ${suffix} oluşturulmuştur.`,
    };
  }

  if (domain) {
    const match = REFERRAL_DOMAINS.find((r) => r.test(domain));
    if (match) {
      return {
        key: `referral_${match.label.toLowerCase()}`,
        label: match.label,
        icon: match.icon,
        headline: `${match.label} üzerinden yönlendirme ile oluşturulmuştur.`,
      };
    }
    return {
      key: "referral_other",
      label: referrerDomain,
      icon: "referral",
      headline: `${referrerDomain} üzerinden yönlendirme ile oluşturulmuştur.`,
    };
  }

  return {
    key: "direct",
    label: "Doğrudan",
    icon: "direct",
    headline: "Doğrudan ziyaret ile oluşturulmuştur.",
  };
}
