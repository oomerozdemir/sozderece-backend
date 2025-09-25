import prisma from "../utils/prisma.js";


export const listTeacherPublishRequests = async (req, res) => {
  const items = await prisma.teacherProfile.findMany({
    where: { publishStatus: "PENDING" },
    include: {
      reviewer: { select: { id: true, name: true, email: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { submittedAt: "desc" },
  });
  res.json({ items });
};

export const approveTeacherPublish = async (req, res) => {
  const { profileId } = req.params;
  const adminId = req.user?.id;

  const updated = await prisma.teacherProfile.update({
    where: { id: profileId },
    data: {
      publishStatus: "APPROVED",
      isPublic: true,
      reviewedAt: new Date(),
      reviewerId: adminId,
      reviewNote: req.body?.note || null,
    },
  });
  res.json({ message: "Öğretmen profili yayına alındı.", profile: updated });
};

export const rejectTeacherPublish = async (req, res) => {
  const { profileId } = req.params;
  const adminId = req.user?.id;

  const updated = await prisma.teacherProfile.update({
    where: { id: profileId },
    data: {
      publishStatus: "REJECTED",
      isPublic: false,
      reviewedAt: new Date(),
      reviewerId: adminId,
      reviewNote: req.body?.note || null,
    },
  });
  res.json({ message: "Yayın talebi reddedildi.", profile: updated });
};


export const getTeacherRequestSummary = async (req, res) => {
  try {
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // son 120 gün (isteğe bağlı)
    const now = new Date();

    // Öğretmen listesi (tablo başlık bilgileri için)
    const teachers = await prisma.teacherProfile.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        slug: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const teacherIds = teachers.map(t => t.id);
    if (teacherIds.length === 0) {
      return res.json({ success: true, items: [] });
    }

    // Son 120 günde TALEPLER
    const requests = await prisma.studentLessonRequest.findMany({
      where: {
        teacherProfileId: { in: teacherIds },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        teacherProfileId: true,
        status: true,          // SUBMITTED | PACKAGE_SELECTED | PAID | CANCELLED
        createdAt: true,
      },
    });

    // Son 120 günde RANDEVULAR
    const appts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: { in: teacherIds },
        startsAt: { gte: since },
      },
      select: {
        id: true,
        teacherProfileId: true,
        status: true,          // PENDING | CONFIRMED | CANCELLED
        startsAt: true,
        endsAt: true,
        notes: true,
      },
    });

    // requestId eşlemesi (öğretmenin “kabul ettiği talep” tespiti için)
    const getReqIdFromNotes = (notes) => {
      const m = /requestId=([a-z0-9]+)/i.exec(notes || "");
      return m?.[1] || null;
    };

    // Talep -> öğretmen
    const reqByTeacher = new Map();
    for (const r of requests) {
      if (!reqByTeacher.has(r.teacherProfileId)) reqByTeacher.set(r.teacherProfileId, []);
      reqByTeacher.get(r.teacherProfileId).push(r);
    }

    // Randevu -> öğretmen
    const apptByTeacher = new Map();
    for (const a of appts) {
      if (!apptByTeacher.has(a.teacherProfileId)) apptByTeacher.set(a.teacherProfileId, []);
      apptByTeacher.get(a.teacherProfileId).push(a);
    }

    // Talep kabul edildi mi? -> o talebe ait en az bir CONFIRMED randevu var mı
    const confirmedByRequest = new Map(); // requestId -> true
    for (const a of appts) {
      if (a.status === "CONFIRMED") {
        const rid = getReqIdFromNotes(a.notes);
        if (rid) confirmedByRequest.set(rid, true);
      }
    }

    const items = teachers.map((t) => {
      const tReqs = reqByTeacher.get(t.id) || [];
      const tAppts = apptByTeacher.get(t.id) || [];

      // Talep sayıları
      const reqCounts = {
        SUBMITTED: 0,
        PACKAGE_SELECTED: 0,
        PAID: 0,
        CANCELLED: 0,
        ACCEPTED: 0,  // türetilmiş: confirmed randevusu olan talepler
      };
      for (const r of tReqs) {
        reqCounts[r.status] = (reqCounts[r.status] || 0) + 1;
        if (confirmedByRequest.get(r.id)) reqCounts.ACCEPTED += 1;
      }

      // Randevu sayıları
      let pending = 0, confirmed = 0, cancelled = 0, completed = 0;
      for (const a of tAppts) {
        if (a.status === "PENDING") pending++;
        if (a.status === "CONFIRMED") {
          confirmed++;
          if (a.endsAt && a.endsAt < now) completed++; // tamamlandı kabul ediyoruz
        }
        if (a.status === "CANCELLED") cancelled++;
      }

      return {
        teacher: {
          id: t.id,
          name: `${t.firstName || ""} ${t.lastName || ""}`.trim(),
          email: t.user?.email || null,
          slug: t.slug,
        },
        requests: reqCounts,
        appointments: { pending, confirmed, cancelled, completed },
      };
    });

    return res.json({ success: true, items });
  } catch (e) {
    console.error("getTeacherRequestSummary error:", e);
    return res.status(500).json({ success: false, message: "Özet getirilemedi." });
  }
};