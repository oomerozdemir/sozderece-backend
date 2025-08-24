// cron/cookies.js
export const REMEMBER_COOKIE_NAME = "rememberMe";

export const rememberCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // PROD: true, DEV (http): false
  sameSite: "none",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün (ms)
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
};
