import prisma from "../utils/prisma.js";


export const getLessonRequestHealth = async (req, res) => {
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Son 90 günden talepler + ilişkiler
    const requests = await prisma.studentLessonRequest.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        subject: true,
        grade: true,
        mode: true,
        note: true,
        studentId: true,
        teacherProfileId: true,
        packageSlug: true,
        packageTitle: true,
        packageUnitPrice: true,
        orderId: true,
        student: { select: { id: true, name: true, email: true, phone: true } },
        teacherProfile: {
          select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } },
        },
        order: { select: { id: true, status: true } },
      },
    });

    // İlgili randevuları tek seferde çek (requestId ipucu notes içinde)
    const appts = await prisma.appointment.findMany({
      where: { startsAt: { gte: since } },
      select: {
        id: true, teacherProfileId: true, studentUserId: true,
        startsAt: true, endsAt: true, status: true, notes: true,
      },
      orderBy: { startsAt: "asc" },
    });

    const getReqIdFromNotes = (notes) => {
      const m = /requestId=([a-z0-9]+)/i.exec(notes || "");
      return m?.[1] || null;
    };

    // RequestId -> randevular
    const byReq = new Map();
    for (const a of appts) {
      const rid = getReqIdFromNotes(a.notes);
      if (!rid) continue;
      if (!byReq.has(rid)) byReq.set(rid, []);
      byReq.get(rid).push(a);
    }

    const items = requests.map((r) => {
      const list = byReq.get(r.id) || [];
      const pendingCount   = list.filter((x) => x.status === "PENDING").length;
      const confirmedCount = list.filter((x) => x.status === "CONFIRMED").length;

      // Öğrenci tarafı “onay”: ödeme tamam (paid) ya da request PAID (ücretsiz hakla)
      const orderPaid = r.order?.status === "paid";
      const requestPaid = r.status === "PAID"; // free-right akışında da PAID oluyor
      const hasPaymentOrFree = Boolean(orderPaid || requestPaid);

      // Uyuşmazlık kuralları
      const mismatch = {
        paymentButNoConfirm: hasPaymentOrFree && confirmedCount === 0,
        confirmButNoPayment: confirmedCount > 0 && !hasPaymentOrFree,
        pendingTooLong: !hasPaymentOrFree && pendingCount > 0,
      };
      const ok = !mismatch.paymentButNoConfirm && !mismatch.confirmButNoPayment;

      return {
        requestId: r.id,
        createdAt: r.createdAt,
        requestStatus: r.status,
        orderStatus: r.order?.status || null,
        subject: r.subject,
        grade: r.grade,
        mode: r.mode,
        packageSlug: r.packageSlug,
        packageTitle: r.packageTitle,
        student: { id: r.student?.id, name: r.student?.name, email: r.student?.email },
        teacher: {
          id: r.teacherProfile?.id,
          name: `${r.teacherProfile?.firstName || ""} ${r.teacherProfile?.lastName || ""}`.trim(),
          email: r.teacherProfile?.user?.email || null,
        },
        counts: { pending: pendingCount, confirmed: confirmedCount },
        hasPaymentOrFree,
        mismatch,
        ok,
      };
    });

    res.json({ success: true, items });
  } catch (e) {
    console.error("getLessonRequestHealth error:", e);
    res.status(500).json({ success: false, message: "Talep sağlığı getirilemedi." });
  }
};
