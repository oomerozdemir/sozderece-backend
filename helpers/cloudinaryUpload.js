import cloudinary from "../utils/cloudinary.js";

// `extraOptions` mevcut çağrıları etkilemeden (varsayılan {}), ihtiyaç
// duyan yeni çağrıların upload_stream seçeneklerine ekleme yapmasını sağlar
// — örn. AI Soru Asistanı, Claude'a gidecek boyut-sınırlı bir kopya için
// `eager:[{width:1568,crop:"limit",...}]` geçiriyor (bkz. aiQuestion.controller.js).
export const uploadBufferToCloudinary = (buffer, filenameHint = "coach", folder = "coaches", extraOptions = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        public_id: undefined,
        overwrite: true,
        transformation: [{ fetch_format: "webp", quality: "auto" }],
        ...extraOptions,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
