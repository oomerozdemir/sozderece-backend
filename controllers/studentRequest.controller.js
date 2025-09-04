import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const createStudentRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id; // authenticateToken sonrası
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId); // 🔧 Int'e çevir

    const {
      teacherSlug,
      subject = "",
      grade = "",
      mode = "ONLINE",          // "ONLINE" | "FACE_TO_FACE"
      city = "",
      district = "",
      locationNote = "",
      note = "",
    } = req.body || {};

    // 🔧 Öğretmeni tüm gerekli alanlarla çek (subjects/grades lazım!)
    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug: teacherSlug },
      select: { id: true, mode: true, subjects: true, grades: true },
    });
    if (!teacher) {
      return res.status(404).json({ message: "Öğretmen bulunamadı" });
    }

    // 🔧 Enum/harf doğrulaması
    const modeNorm = String(mode).toUpperCase(); // ONLINE / FACE_TO_FACE

    // BE validasyon – öğretmenin verdiği ders/grade & mod uygun mu?
    if (teacher.subjects && !teacher.subjects.includes(subject)) {
      return res.status(400).json({ message: "Öğretmen bu dersi vermiyor." });
    }
    if (teacher.grades && !teacher.grades.includes(grade)) {
      return res.status(400).json({ message: "Seçilen seviye geçerli değil." });
    }
    const allowedMode = teacher.mode === "BOTH" ? ["ONLINE", "FACE_TO_FACE"] : [teacher.mode];
    if (!allowedMode.includes(modeNorm)) {
      return res.status(400).json({ message: "Öğretmenin ders modu buna uygun değil." });
    }

    // Yüz yüze ise şehir/ilçe gerekli
    if (modeNorm === "FACE_TO_FACE" && (!city || !district)) {
      return res.status(400).json({ message: "Yüz yüze için şehir ve ilçe gerekli." });
    }

    const rec = await prisma.studentLessonRequest.create({
      data: {
        studentId: userId,                // 🔴 kritik: Int
        teacherProfileId: teacher.id,     // 🔴 kritik: teacher FK
        subject,
        grade,
        mode: modeNorm,                   // "ONLINE" | "FACE_TO_FACE"
        city: city || null,
        district: district || null,
        locationNote: locationNote || null,
        note: note || null,
        status: "SUBMITTED",
      },
      select: { id: true, studentId: true, status: true },
    });

    res.status(201).json({ success: true, request: rec, id: rec.id });
  } catch (e) {
    console.error("createStudentRequest error:", e);
    res.status(500).json({
      message: "Talep oluşturulamadı.",
      error: e?.message || String(e),
    });
  }
};

export const getStudentRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params; // cuid (String)
    const rec = await prisma.studentLessonRequest.findUnique({
      where: { id },
    });
    if (!rec || rec.studentId !== userId) {
      return res.status(404).json({ message: "Bulunamadı." });
    }
    res.json({ success: true, request: rec });
  } catch (e) {
    console.error("getStudentRequest error:", e);
    res.status(500).json({ message: "Hata.", error: e?.message || String(e) });
  }
};

export const attachPackageToRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params; // cuid
    const { packageSlug, packageTitle, unitPrice } = req.body; // unitPrice kuruş

    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) {
      return res.status(404).json({ message: "Bulunamadı." });
    }

    const updated = await prisma.studentLessonRequest.update({
      where: { id },
      data: {
        packageSlug,
        packageTitle,
        packageUnitPrice: Number(unitPrice),
        status: "PACKAGE_SELECTED",
      },
    });

    res.json({ success: true, request: updated });
  } catch (e) {
    console.error("attachPackageToRequest error:", e);
    res.status(500).json({ message: "Paket ilişkilendirilemedi.", error: e?.message || String(e) });
  }
};

export const markRequestPaid = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params;  // cuid
    const { orderId } = req.body; // Int veya String? (schema'na göre)

    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) {
      return res.status(404).json({ message: "Bulunamadı." });
    }

    const updated = await prisma.studentLessonRequest.update({
      where: { id },
      data: { status: "PAID", orderId },
    });

    res.json({ success: true, request: updated });
  } catch (e) {
    console.error("markRequestPaid error:", e);
    res.status(500).json({ message: "Durum güncellenemedi.", error: e?.message || String(e) });
  }
};


export const saveRequestSlots = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params;   // StudentLessonRequest.id (cuid)
    const { slots } = req.body || {};

    const reqRec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!reqRec || reqRec.studentId !== userId) {
      return res.status(404).json({ message: "Talep bulunamadı." });
    }

    // Paket adetini zorunlu tut
    const lessonsCount =
      reqRec.packageSlug === "paket-3" ? 3 :
      reqRec.packageSlug === "paket-6" ? 6 : 1;

    if (!Array.isArray(slots) || slots.length !== lessonsCount) {
      return res.status(400).json({ message: `Lütfen ${lessonsCount} adet saat seçiniz.` });
    }

    // Çakışma kontrolü (öğretmenin mevcut PENDING/CONFIRMED randevuları ile)
    const sMin = new Date(Math.min(...slots.map(s => +new Date(s.start))));
    const eMax = new Date(Math.max(...slots.map(s => +new Date(s.end))));

    const conflicts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: reqRec.teacherProfileId,
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [
          { startsAt: { lt: eMax }, endsAt: { gt: sMin } }
        ]
      },
      select: { startsAt: true, endsAt: true }
    });

    const hasConflict = (s) => conflicts.some(c => (new Date(s.start) < c.endsAt && new Date(s.end) > c.startsAt));
    if (slots.some(hasConflict)) {
      return res.status(409).json({ message: "Seçilen saatlerden bazıları dolu görünüyor. Lütfen güncelleyiniz." });
    }

    // Randevuları PENDING oluştur
    const perLessonPrice = reqRec.packageUnitPrice
      ? Math.round(Number(reqRec.packageUnitPrice) / lessonsCount)
      : null;

    await prisma.$transaction(
      slots.map(s => prisma.appointment.create({
        data: {
          teacherProfileId: reqRec.teacherProfileId,
          studentUserId: userId,
          startsAt: new Date(s.start),
          endsAt:   new Date(s.end),
          mode:     reqRec.mode,       // RequestMode ~ LessonMode
          status:   "PENDING",
          price:    perLessonPrice,
          title:    "Özel ders talebi",
          notes:    `requestId=${reqRec.id}`
        }
      }))
    );

    return res.json({ success: true });
  } catch (e) {
    console.error("saveRequestSlots error:", e);
    return res.status(500).json({ message: "Seçilen saatler kaydedilemedi." });
  }
};