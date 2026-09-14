import { v2 as cloudinary } from "cloudinary"; 
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "sozderece",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ fetch_format: "webp", quality: "auto" }],
    use_filename: false,
    unique_filename: true,
    overwrite: true,
  },
});



const limits = { fileSize: 5 * 1024 * 1024 }; // 5MB
const fileFilter = (req, file, cb) => {
  const ok = /image\/(jpe?g|png|webp|gif)/i.test(file.mimetype);
  ok ? cb(null, true) : cb(new Error("Sadece resim yükleyin."));
};


const upload = multer({ storage, limits, fileFilter });
export default upload;
export { cloudinary };

// Koç günlük sesli notu — Cloudinary ses dosyalarını "video" resource_type
// altında işliyor (kendi video pipeline'ını kullanıyor, ayrı bir sistem
// gerekmiyor). 10sn'lik kısa bir not hedeflendiği için limit cömert
// tutulmuyor ama tarayıcı MediaRecorder çıktısının (webm/opus) sığması
// için 8MB'a çekildi.
const audioStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "sozderece/coach-notes",
    resource_type: "video", // Cloudinary ses dosyalarını böyle işliyor
    allowed_formats: ["mp3", "wav", "m4a", "ogg", "webm", "mp4"],
    use_filename: false,
    unique_filename: true,
  },
});
const audioLimits = { fileSize: 8 * 1024 * 1024 }; // 8MB
const audioFileFilter = (req, file, cb) => {
  const ok = /audio\/|video\/webm|video\/mp4/i.test(file.mimetype);
  ok ? cb(null, true) : cb(new Error("Sadece ses dosyası yükleyin."));
};
export const uploadAudio = multer({ storage: audioStorage, limits: audioLimits, fileFilter: audioFileFilter });