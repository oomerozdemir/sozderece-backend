import jwt from "jsonwebtoken";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
 

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("❌ Token bulunamadı");
    return res.status(401).json({ success: false, message: "Token bulunamadı" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token doğrulandı:");
    req.user = decoded;
    next();
  } catch (error) {
    console.error("❌ Token doğrulanamadı:");
    return res.status(401).json({ success: false, message: "Token geçersiz" });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ success: false, message: "Yetkisiz erişim" });
    }
    next();
  };
};

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,          // 🟢 Mutlaka gerekli
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};