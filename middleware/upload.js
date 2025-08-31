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