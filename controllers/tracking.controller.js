import prisma from "../utils/prisma.js";
import { parseUserAgent } from "../utils/parseUserAgent.js";
import { classifyChannel } from "../utils/classifyChannel.js";

// 30 dakika hareketsizlik sonrası oturum sonlanmış sayılır (GA4 varsayılanıyla aynı).
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const extractDomain = (url) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// POST /api/tracking/session/start
// Yeni bir oturum başlatır (ilk ziyaret veya 30dk+ hareketsizlik sonrası).
// Ziyaretçi kimliği client'ta üretilip (localStorage) buraya gönderilir; ama
// oturum kimliği sahtekarlık/çakışma riskine karşı SUNUCU tarafında üretilir.
export const startSession = async (req, res) => {
  try {
    const { visitorId, referrer, landingUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = req.body || {};
    if (!visitorId || typeof visitorId !== "string" || visitorId.length > 100) {
      return res.status(400).json({ success: false, message: "Geçersiz ziyaretçi kimliği." });
    }

    const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
    const { deviceType, os, browser } = parseUserAgent(userAgent);
    const referrerDomain = extractDomain(referrer);
    const landingDomain = extractDomain(landingUrl);
    // Kendi domainimizden gelen "referrer" (ör. site içi navigasyon) trafik
    // kaynağı değildir — bu durumda referrer'ı yok sayıyoruz.
    const siteDomains = ["sozderecekocluk.com", "localhost"];
    const isInternalReferrer = referrerDomain && (siteDomains.some((d) => referrerDomain.includes(d)) || referrerDomain === landingDomain);
    const cleanReferrer = isInternalReferrer ? null : (referrer || null);
    const cleanReferrerDomain = isInternalReferrer ? null : referrerDomain;

    const { headline, icon, key: channel } = classifyChannel({
      utmSource,
      utmMedium,
      referrerDomain: cleanReferrerDomain,
    });

    await prisma.visitor.upsert({
      where: { id: visitorId },
      update: { lastSeenAt: new Date() },
      create: { id: visitorId },
    });

    const session = await prisma.visitorSession.create({
      data: {
        visitorId,
        referrer: cleanReferrer,
        referrerDomain: cleanReferrerDomain,
        landingPage: landingUrl ? landingUrl.slice(0, 1000) : null,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        utmTerm: utmTerm || null,
        utmContent: utmContent || null,
        channel,
        deviceType,
        os,
        browser,
        userAgent,
      },
    });

    return res.status(201).json({ success: true, sessionId: session.id, headline, icon });
  } catch (err) {
    console.error("startSession error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// POST /api/tracking/session/ping
// Aynı oturum içindeki sayfa geçişlerinde çağrılır — aktiviteyi ve sayfa
// görüntüleme sayısını günceller. Oturum süresi dolmuşsa (30dk+) sessizce
// no-op döner; client bunu yeni bir startSession çağrısıyla telafi eder.
export const pingSession = async (req, res) => {
  try {
    const { visitorId, sessionId } = req.body || {};
    if (!visitorId || !sessionId) {
      return res.status(400).json({ success: false, message: "Eksik parametre." });
    }

    const session = await prisma.visitorSession.findUnique({ where: { id: sessionId } });
    if (!session || session.visitorId !== visitorId) {
      return res.status(404).json({ success: false, message: "Oturum bulunamadı." });
    }

    const expired = Date.now() - new Date(session.lastActivityAt).getTime() > SESSION_TIMEOUT_MS;
    if (expired) {
      return res.status(410).json({ success: false, expired: true, message: "Oturum süresi doldu." });
    }

    await prisma.visitorSession.update({
      where: { id: sessionId },
      data: { pageViewCount: { increment: 1 } },
    });
    await prisma.visitor.update({ where: { id: visitorId }, data: { lastSeenAt: new Date() } });

    return res.json({ success: true });
  } catch (err) {
    console.error("pingSession error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};
