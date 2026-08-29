import { uploadBufferToCloudinary } from "../helpers/cloudinaryUpload.js";

export const uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Dosya bulunamadı." });
    }
    // cloudinary <2.7.0 "&" içeren parametrelerle argument injection'a açık
    // (GHSA-g4mf-96x5-5m2c); büyük sürüm yükseltmesi test edilmeden yapılmadığı
    // için burada whitelist ile aynı sınıf saldırıyı kapatıyoruz.
    const rawFolder = req.body.folder || "sozderece-media";
    const folder = /^[a-zA-Z0-9/_-]{1,100}$/.test(rawFolder) ? rawFolder : "sozderece-media";
    const result = await uploadBufferToCloudinary(req.file.buffer, "image", folder);
    return res.json({ url: result.secure_url });
  } catch (err) {
    console.error("uploadImage error:", err);
    return res.status(500).json({ message: "Yükleme başarısız: " + err.message });
  }
};
