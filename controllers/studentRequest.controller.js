import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import { sendNewRequestToTeacher } from "../utils/sendEmail.js";

export const createStudentRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const {
      teacherSlug,
      subject = "",
      grade = "",
      mode = "ONLINE",
      city = "",
      district = "",
      locationNote = "",
      note = "",
      // yeni akış
      slots = [],                 // [{ start, end, mode? }]
      packageSlug = "",
      packageTitle = "",
      unitPrice,                  // kuruş (Number)
    } = req.body || {};

    // öğretmen
    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug: teacherSlug },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mode: true,
        subjects: true,
        grades: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (!teacher) return res.status(404).json({ message: "Öğretmen bulunamadı" });

    const modeNorm = String(mode).toUpperCase();

    // doğrulamalar
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
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ message: "En az bir ders saati seçmelisiniz." });
    }
    if (!packageSlug || !packageTitle || typeof unitPrice !== "number") {
      return res.status(400).json({ message: "Paket bilgileri eksik (slug/title/unitPrice)." });
    }

    // 🎯 yeni akışta request direkt 'PACKAGE_SELECTED'
    const reqStatus = "PACKAGE_SELECTED";

    // 1) Request'i oluştur
    const request = await prisma.studentLessonRequest.create({
      data: {
        studentId: userId,
        teacherProfileId: teacher.id,
        subject,
        grade,
        mode: modeNorm,
        city: city || null,
        district: district || null,
        locationNote: locationNote || null,
        note: note || null,
        status: reqStatus,
        packageSlug: packageSlug,
        packageTitle: packageTitle,
        packageUnitPrice: unitPrice, // kuruş
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

    // 2) Slotlardan randevuları oluştur (PENDING)
    const toCreate = slots.map((s) => {
      const startsAt = new Date(s.start || s.startsAt);
      const endsAt   = new Date(s.end   || s.endsAt);
      if (isNaN(startsAt) || isNaN(endsAt)) {
        throw new Error("Geçersiz slot tarih/saat formatı.");
      }
      return {
        teacherProfileId: teacher.id,
        studentUserId: userId,
        startsAt,
        endsAt,
        mode: s.mode ? String(s.mode).toUpperCase() : modeNorm,
        status: "PENDING",
        notes: `requestId=${request.id}`,
      };
    });

    // createMany ile randevuları ekle
    if (toCreate.length > 0) {
      await prisma.appointment.createMany({ data: toCreate });
    }

    // 3) Öğretmene bilgilendirme maili
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const teacherEmail = teacher.user?.email;
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
          packageTitle: packageTitle,
          lessonsCount: packageSlug === "paket-6" ? 6 : packageSlug === "paket-3" ? 3 : 1,
          note: request.note || "",
          requestId: request.id,
          createdAt: request.createdAt,
        });
      } catch (err) {
        console.error("Yeni talep maili gönderilemedi:", err?.message || err);
      }
    }

    // 4) cevap
    return res.status(201).json({ success: true, id: request.id, request });
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

    const lessonsCount =
      reqRec.packageSlug === "paket-3" ? 3 :
      reqRec.packageSlug === "paket-6" ? 6 : 1;

    if (!Array.isArray(slots) || slots.length !== lessonsCount) {
      return res.status(400).json({ message: `Lütfen ${lessonsCount} adet saat seçiniz.` });
    }

    // ✅ BUGFIX: .slots yerine ...slots
    const sMin = new Date(Math.min(...slots.map(s => +new Date(s.start))));
    const eMax = new Date(Math.max(...slots.map(s => +new Date(s.end))));

    const conflicts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: reqRec.teacherProfileId,
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [{ startsAt: { lt: eMax }, endsAt: { gt: sMin } }],
      },
      select: { startsAt: true, endsAt: true },
    });

    const hasConflict = (s) =>
      conflicts.some(c => (new Date(s.start) < c.endsAt && new Date(s.end) > c.startsAt));
    if (slots.some(hasConflict)) {
      return res.status(409).json({ message: "Seçilen saatlerden bazıları dolu görünüyor. Lütfen güncelleyiniz." });
    }

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
          mode:     reqRec.mode,
          status:   "PENDING",
          price:    perLessonPrice,
          title:    "Özel ders talebi",
          notes:    `requestId=${reqRec.id}`,
        }
      }))
    );

    return res.json({ success: true });
  } catch (e) {
    console.error("saveRequestSlots error:", e);
    return res.status(500).json({ message: "Seçilen saatler kaydedilemedi." });
  }
};


/** Öğrencinin kendi talepleri (paket ve randevu özetleriyle) */
export const listMyRequests = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    // Son 90 gün randevu eşlemesi için
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Öğrencinin talepleri (öğretmen bilgisi dahil)
    const requests = await prisma.studentLessonRequest.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,            // SUBMITTED | PACKAGE_SELECTED | PAID | CANCELLED
        subject: true,
        grade: true,
        mode: true,              // ONLINE | FACE_TO_FACE
        packageSlug: true,
        packageTitle: true,
        packageUnitPrice: true,
        teacherProfileId: true,
        teacherProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true, phone: true } },
          },
        },
      },
    });

    // Randevular (öğrenciye ait) — PENDING ve CONFIRMED
    const [pendingAppts, confirmedAppts] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          studentUserId: userId,
          status: "PENDING",
          startsAt: { gte: since },
        },
        select: { id: true, startsAt: true, endsAt: true, mode: true, notes: true, price: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          studentUserId: userId,
          status: "CONFIRMED",
          startsAt: { gte: since },
        },
        select: { id: true, startsAt: true, endsAt: true, mode: true, notes: true, price: true },
        orderBy: { startsAt: "asc" },
      }),
    ]);

    // notes içinden requestId çekmek için yardımcı
    const getReqIdFromNotes = (notes) => {
      const m = /requestId=([a-z0-9]+)/i.exec(notes || "");
      return m?.[1] || null;
    };

    // Talepleri map’e koy
    const mapByReq = new Map();
    for (const r of requests) {
      const lessonsCount =
        r.packageSlug === "paket-6" ? 6 :
        r.packageSlug === "paket-3" ? 3 : 1;

      mapByReq.set(r.id, {
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        subject: r.subject,
        grade: r.grade,
        mode: r.mode,
        packageSlug: r.packageSlug,
        packageTitle: r.packageTitle,
        packageUnitPrice: r.packageUnitPrice,
        lessonsCount,
        paidTL: typeof r.packageUnitPrice === "number" ? r.packageUnitPrice / 100 : null,
        teacher: r.teacherProfile ? {
          id: r.teacherProfile.id,
          name: `${r.teacherProfile.firstName || ""} ${r.teacherProfile.lastName || ""}`.trim(),
          email: r.teacherProfile.user?.email || null,
          phone: r.teacherProfile.user?.phone || null,
        } : null,
        appointments: [],
        appointmentsConfirmed: [],
      });
    }

    // Randevuları taleplere dağıt
    for (const a of pendingAppts) {
      const rid = getReqIdFromNotes(a.notes);
      if (rid && mapByReq.has(rid)) mapByReq.get(rid).appointments.push(a);
    }
    for (const a of confirmedAppts) {
      const rid = getReqIdFromNotes(a.notes);
      if (rid && mapByReq.has(rid)) mapByReq.get(rid).appointmentsConfirmed.push(a);
    }

    return res.json({ success: true, items: Array.from(mapByReq.values()) });
  } catch (e) {
    console.error("listMyRequests error:", e);
    return res.status(500).json({ message: "Talepler getirilemedi." });
  }
};