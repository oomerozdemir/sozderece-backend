// src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";

/**
 * Korunan rotalar için Bearer token doğrulaması.
 * Hata durumunda 401 döner.
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Token bulunamadı" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded: { id, email, role, iat, exp }
    req.user = decoded;
    return next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Token geçersiz" });
  }
};

/**
 * Rol tabanlı yetki kontrolü.
 * Örn: authorizeRoles("admin", "coach")
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Kullanıcı doğrulanamadı veya rol bilgisi eksik.",
      });
    }

    const userRole = String(req.user.role).toLowerCase();
    const ok = allowedRoles.map(r => r.toLowerCase()).includes(userRole);
    if (!ok) {
      return res.status(403).json({ success: false, message: "Yetkisiz erişim" });
    }

    return next();
  };
};

/**
 * Kısa ömürlü erişim token üretimi.
 * "Beni hatırla" kalıcılığı artık cookie ile sağlanıyor;
 * bu yüzden burada uzun expiry kullanmıyoruz.
 *
 * Ortam değişkenleri:
 * - JWT_SECRET (zorunlu)
 * - JWT_EXPIRES_IN (opsiyonel, varsayılan "7d")
 */
export const generateToken = (user /*, rememberMe = false */) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d"; // kısa tut: 1d–7d arası ideal

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};
