import cloudinary from "../utils/cloudinary.js";

export const uploadBufferToCloudinary = (buffer, filenameHint = "coach", folder = "coaches") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        public_id: undefined, 
        overwrite: true,
        transformation: [{ fetch_format: "webp", quality: "auto" }],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
