// cron/cookies.js
export const REMEMBER_COOKIE_NAME = "rememberMe"; // veya istediğin ad

export const rememberCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün
  // domain: process.env.COOKIE_DOMAIN, // gerekirse
};
