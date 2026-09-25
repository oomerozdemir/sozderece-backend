// İlk birkaç byte'a bakarak gerçek dosya tipini tespit eder — multer'ın
// fileFilter'ı yalnızca client'ın form-data'da BEYAN ettiği mimetype'a
// bakıyor, bu kolayca sahteleneceği için tek başına güvenilir değil.
// Yalnızca bu özelliğin kabul ettiği 4 tip destekleniyor.
export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.slice(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  return null;
}
