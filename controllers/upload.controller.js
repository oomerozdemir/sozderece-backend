import { uploadBufferToCloudinary } from "../helpers/cloudinaryUpload.js";

export const uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Dosya bulunamadı." });
    }
    const folder = req.body.folder || "sozderece-media";
    const result = await uploadBufferToCloudinary(req.file.buffer, "image", folder);
    return res.json({ url: result.secure_url });
  } catch (err) {
    console.error("uploadImage error:", err);
    return res.status(500).json({ message: "Yükleme başarısız: " + err.message });
  }
};
