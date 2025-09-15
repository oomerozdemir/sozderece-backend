import prisma from "../utils/prisma.js";
import { sendNewRequestToTeacher } from "../utils/sendEmail.js";

/* =========================
   Talep Oluştur
========================= */
export const createStudentRequest = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const {
      teacherSlug,
      subject = "",
      grade = "",
      mode = "ONLINE",
      city = "",
      district = "",
      locationNote = "",
      note = "",
      slots = [],                 // [{ start, end }]
      packageSlug = null,
      packageTitle = null,
      unitPrice = null,           // kuruş
    } = req.body || {};

    // Öğretmen + mail bilgisi
    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug: teacherSlug },
      select: {
        id: true, firstName: true, lastName: true, mode: true,
        subjects: true, grades: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (!teacher) return res.status(404).json({ message: "Öğretmen bulunamadı." });

    const modeNorm = String(mode).toUpperCase();
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
      return res.status(400).json({ message: "Lütfen en az bir saat seçiniz." });
    }

    // Talep
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
        status: "SUBMITTED",
        packageSlug: packageSlug || null,
        packageTitle: packageTitle || null,
        packageUnitPrice: typeof unitPrice === "number" ? unitPrice : null,
      },
      select: {
        id: true, createdAt: true, subject: true, grade: true, mode: true, note: true,
        teacherProfileId: true,
      },
    });

    // Seçili slotları randevu olarak PENDING oluştur
    for (const s of slots) {
      const startsAt = new Date(s.start);
      const endsAt   = new Date(s.end);
      if (!isFinite(+startsAt) || !isFinite(+endsAt) || startsAt >= endsAt) continue;
      await prisma.appointment.create({
        data: {
          teacherProfileId: teacher.id,
          studentUserId: userId,
          startsAt, endsAt,
          status: "PENDING",
          mode: modeNorm,
          notes: [note, `requestId=${request.id}`].filter(Boolean).join(" | "),
           status: "PENDING",
        },
      });
    }

    // Öğrenci bilgisi (mail içeriği için)
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    // 🔔 Öğretmene mail
    const teacherEmail = teacher.user?.email;
    if (teacherEmail) {
      const teacherName = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.user?.name || "";
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
          packageTitle: packageTitle || undefined,
          lessonsCount: Array.isArray(slots) ? slots.length : undefined,
          note: request.note || "",
          requestId: request.id,
          createdAt: request.createdAt,
        });
      } catch (err) {
        console.error("❌ Öğretmen maili hata:", err?.message || err);
      }
    }

    return res.status(201).json({ success: true, id: request.id, request });
  } catch (e) {
    console.error("createStudentRequest error:", e);
    return res.status(500).json({ message: "Talep oluşturulamadı.", error: e?.message || String(e) });
  }
};

/* =========================
   Tekil Talep (öğrencinin)
========================= */
export const getStudentRequest = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params; // cuid (String)
    const rec = await prisma.studentLessonRequest.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, status: true } }, // UI için
      },
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

/* =========================
   Talebe Paket Ekle / Güncelle
========================= */
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

    // PAID/CANCELLED'e düşürme!
    const next = {
      packageSlug,
      packageTitle,
      packageUnitPrice: Number(unitPrice),
    };
    const cur = String(rec.status || "").toUpperCase();
    if (cur !== "PAID" && cur !== "CANCELLED") {
      next.status = "PACKAGE_SELECTED";
    }

    const updated = await prisma.studentLessonRequest.update({
      where: { id: requestId },
      data: { status: "PAID" }
    });

    res.json({ success: true, request: updated });
  } catch (e) {
    console.error("attachPackageToRequest error:", e);
    res.status(500).json({ message: "Paket ilişkilendirilemedi.", error: e?.message || String(e) });
  }
};

/* =========================
   (Opsiyonel) Talebi PAID işaretle
========================= */
export const markRequestPaid = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    const { id } = req.params;  // cuid
    const { orderId } = req.body; // Int

    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) {
      return res.status(404).json({ message: "Bulunamadı." });
    }

    const updated = await prisma.studentLessonRequest.update({
      where: { id },
      data: { status: "PAID", orderId: orderId ?? rec.orderId ?? null },
    });

    res.json({ success: true, request: updated });
  } catch (e) {
    console.error("markRequestPaid error:", e);
    res.status(500).json({ message: "Durum güncellenemedi.", error: e?.message || String(e) });
  }
};

/* =========================
   Talep için slot kaydet
========================= */
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

    // Tüm aralıklar için min-start / max-end
    const sMin = new Date(Math.min(...slots.map(s => +new Date(s.start))));
    const eMax = new Date(Math.max(...slots.map(s => +new Date(s.end))));

    // 🔧 Çakışma kontrolü: (startsAt < eMax) AND (endsAt > sMin)
    const conflicts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: reqRec.teacherProfileId,
        status: { in: ["PENDING", "CONFIRMED"] },
        AND: [{ startsAt: { lt: eMax } }, { endsAt: { gt: sMin } }],
      },
      select: { startsAt: true, endsAt: true },
    });

    const overlaps = (s) =>
      conflicts.some(c => (new Date(s.start) < c.endsAt && new Date(s.end) > c.startsAt));
    if (slots.some(overlaps)) {
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

/* =========================
   Öğrencinin Talepleri (özet)
========================= */
export const listMyRequests = async (req, res) => {
  try {
    const rawUserId = req.user?.id;
    if (!rawUserId) return res.status(401).json({ message: "Yetkisiz" });
    const userId = Number(rawUserId);

    // Son 90 gün randevu eşlemesi için
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Öğrencinin talepleri (+ order status)
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
        order: { select: { id: true, status: true } }, // <-- EKLENDİ
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

    // Öğrencinin PENDING/CONFIRMED randevuları (yakın tarih)
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

    // notes içinden requestId çek
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
        // 👇 UI'nın kolay okuması için order bilgisi:
        order: r.order ? { id: r.order.id, status: r.order.status } : null,
        orderStatus: r.order?.status || null, // convenience field
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
