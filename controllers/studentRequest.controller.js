import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import { sendNewRequestToTeacher } from "../utils/sendEmail";

export const createStudentRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId); // şema: Int

    const {
      teacherSlug,
      subject = "",
      grade = "",
      mode = "ONLINE",          // "ONLINE" | "FACE_TO_FACE" (RequestMode)
      city = "",
      district = "",
      locationNote = "",
      note = "",                // şema alanı: note
      // not: paket bilgileri talep oluşturma anında genelde yok
    } = req.body || {};

    // 1) Öğretmeni çek (kısıtlar + mail için gerekli user.email)
    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug: teacherSlug },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mode: true,
        subjects: true,
        grades: true,
        user: { select: { email: true, name: true } }, // mail göndermek için
      },
    });
    if (!teacher) {
      return res.status(404).json({ message: "Öğretmen bulunamadı" });
    }

    // 2) Validasyonlar (ders/grade + mod)
    const modeNorm = String(mode).toUpperCase(); // "ONLINE" | "FACE_TO_FACE"
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
    if (modeNorm === "FACE_TO_FACE" && (!city || !district)) {
      return res.status(400).json({ message: "Yüz yüze için şehir ve ilçe gerekli." });
    }

    // 3) Talebi oluştur (şema: StudentLessonRequest)
    const request = await prisma.studentLessonRequest.create({
      data: {
        studentId: userId,              // Int
        teacherProfileId: teacher.id,   // String (cuid)
        subject,
        grade,
        mode: modeNorm,
        city: city || null,
        district: district || null,
        locationNote: locationNote || null,
        note: note || null,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        createdAt: true,
        subject: true,
        grade: true,
        mode: true,
        note: true,
        teacherProfileId: true,
      },
    });

    // 4) Öğrenci bilgisi (mail içerik zenginliği için)
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    // 5) Öğretmenin mail adresi
    const teacherEmail = teacher.user?.email;

    // 6) Maili gönder (mail hatası akışı bozmasın diye try/catch)
    if (teacherEmail) {
      const teacherName =
        `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.user?.name || "";

      const modeLabel = modeNorm === "FACE_TO_FACE" ? "Yüz yüze" : "Online";

      try {
        await sendNewRequestToTeacher(teacherEmail, {
          teacherName,
          studentName: student?.name || "",
          studentEmail: student?.email || "",
          studentPhone: student?.phone || "",
          subject: request.subject,
          grade: request.grade,
          modeLabel,
          // paket alanları talep anında genelde boş:
          packageTitle: undefined,
          lessonsCount: undefined,
          note: request.note || "",
          requestId: request.id,
          createdAt: request.createdAt,
        });
      } catch (err) {
        console.error("Yeni talep maili gönderilemedi:", err?.message || err);
      }
    }

    return res.status(201).json({ success: true, request, id: request.id });
  } catch (e) {
    console.error("createStudentRequest error:", e);
    return res.status(500).json({
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