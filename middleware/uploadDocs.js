import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

// Genel `upload.js` sadece resim kabul ediyor (resource_type: "image") — koç
// başvurusundaki CV ve örnek program dosyaları PDF/Word olabildiği için ayrı
// bir middleware.
//
// KRİTİK: Bu Cloudinary hesabında PDF/ZIP dosyalarının herkese açık
// teslimatı kapalı (varsayılan güvenlik ayarı) — `res.cloudinary.com`
// üzerinden PDF çekmek 401 dönüyor, tarayıcı da bu hata gövdesini "dosya.pdf"
// diye kaydedip "açılmıyor" sonucu veriyordu. Çözüm: dosyalar DB'ye public_id
// olarak yazılıyor ve erişimde sunucu, zaman sınırlı bir
// `private_download_url` (api.cloudinary.com/.../download) üretiyor — bu
// endpoint kısıtlamadan etkilenmiyor, dosyayı doğru Content-Type ile birebir
// gönderiyor (bkz. application.controller.js#signedFileUrl).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const base =
      path
        .basename(file.originalname, path.extname(file.originalname))
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 60) || "dosya";
    const unique =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return {
      folder: "sozderece/basvuru",
      resource_type: "raw",
      public_id: `${base}-${unique}`, // Cloudinary uzantıyı kendi ekliyor
      use_filename: false,
      unique_filename: false,
    };
  },
});

const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Sadece PDF, Word veya resim dosyası yükleyin."));
};

const uploadDocs = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // dosya başına 5MB
  fileFilter,
});

export default uploadDocs;
