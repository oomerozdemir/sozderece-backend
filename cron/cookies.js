// cron/cookies.js
export const rememberCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 30, // ✅ 30 gün (ms)
  // (opsiyonel) domain: process.env.COOKIE_DOMAIN,
};
