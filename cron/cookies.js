// cron/cookies.js
export const REMEMBER_COOKIE_NAME = "rm";

export const rememberCookieOptions = {
  httpOnly: true,
  secure: true,                 // PROD: HTTPS zorunlu
  sameSite: "none",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,    // 30 gün (saniye)
};
