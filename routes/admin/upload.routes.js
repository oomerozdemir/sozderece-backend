import express from "express";
import multer from "multer";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { uploadImage } from "../../controllers/upload.controller.js";

const router = express.Router();

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Sadece görsel dosyaları yüklenebilir."));
  },
});

router.post(
  "/upload-image",
  authenticateToken,
  authorizeRoles("admin"),
  memUpload.single("image"),
  uploadImage
);

export default router;
