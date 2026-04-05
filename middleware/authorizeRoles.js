// Bu dosya authMiddleware.js'deki authorizeRoles ile aynı işlevi görür.
// Tutarlılık için authMiddleware.js'deki sürümü kullanmanız önerilir.
// Null pointer crash fix: req.user kontrolü eklendi.
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Kullanıcı doğrulanamadı veya rol bilgisi eksik.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Bu sayfaya erişim yetkiniz yok",
      });
    }

    next();
  };
};
