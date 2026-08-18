// Bağımlılıksız, regex/substring tabanlı User-Agent ayrıştırıcı. Amaç tam bir
// UA veritabanı değil — pazarlama atfı için önemli olan üç sinyali çıkarmak:
// cihaz tipi, işletim sistemi ve (en önemlisi) Instagram/Facebook/TikTok gibi
// uygulama-içi WebView tarayıcıları, çünkü reklamdan tıklanan linkler genelde
// bu in-app tarayıcılarda açılır.
export function parseUserAgent(uaString) {
  const ua = uaString || "";

  let deviceType = "desktop";
  if (/iPad|Tablet(?!.*Mobile)/i.test(ua)) {
    deviceType = "tablet";
  } else if (/Mobi|Android|iPhone|iPod/i.test(ua)) {
    deviceType = "mobile";
  }

  let os = null;
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = null;
  if (/Instagram/i.test(ua)) browser = "Instagram App";
  else if (/FBAN|FBAV/i.test(ua)) browser = "Facebook App";
  else if (/musical_ly|TikTok/i.test(ua)) browser = "TikTok App";
  else if (/Twitter/i.test(ua)) browser = "X (Twitter) App";
  else if (/WhatsApp/i.test(ua)) browser = "WhatsApp";
  else if (/EdgiOS|Edge|Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/CriOS|Chrome/i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return { deviceType, os, browser };
}

export const deviceTypeLabel = (deviceType) => {
  if (deviceType === "mobile") return "Telefon";
  if (deviceType === "tablet") return "Tablet";
  return "Masaüstü";
};
