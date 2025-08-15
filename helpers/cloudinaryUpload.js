import cloudinary from "../utils/cloudinary";

export const uploadBufferToCloudinary = (buffer, filenameHint = "coach", folder = "coaches") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        public_id: undefined, // Cloudinary unique id üretsin
        overwrite: true,
        transformation: [{ fetch_format: "auto", quality: "auto" }],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
