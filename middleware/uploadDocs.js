import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

// Genel `upload.js` sadece resim kabul ediyor (resource_type: "image") — koç
// başvurusundaki CV ve örnek program dosyaları PDF/Word olabildiği için ayrı
// bir middleware. Tüm dosyalar Cloudinary'ye "raw" olarak yükleniyor: PDF
// teslimatının varsayılan kapalı olduğu hesaplarda bile "raw" URL'ler
// sorunsuz açılır.
//
// ÖNEMLİ: public_id'yi orijinal uzantıyla ("...-a1b2c3.pdf") kuruyoruz.
// Aksi halde raw URL uzantısız kalıyor, Cloudinary octet-stream olarak
// gönderiyor ve indirilen dosya "bilinmeyen dosya" gibi açılmıyordu.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase();
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
      public_id: `${base}-${unique}${ext}`,
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
