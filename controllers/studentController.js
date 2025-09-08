// controllers/studentController.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: "Geçersiz kullanıcı kimliği" });
    }

   const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    assignedCoach: {
      select: {
        name: true,
        subject: true,
        description: true,
        image: true, // ✅ Koçun resmi
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
      },
    },
  },
});



    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    res.json(user);
  } catch (error) {
    console.error("Öğrenci bilgileri alınamadı:", error);
    res.status(500).json({ message: "Bir hata oluştu." });
  }
};


/** Öğrencinin işaretlediği geçmiş dersler */
export const getMyPastAppointmentsStudent = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const items = await prisma.appointment.findMany({
      where: {
        studentUserId: userId,
        notes: { contains: "doneStudentAt=" },
      },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        notes: true,
        teacher: {
          select: { firstName: true, lastName: true, user: { select: { email: true } } },
        },
      },
    });

    res.json({ success: true, items });
  } catch (e) {
    console.error("getMyPastAppointmentsStudent error:", e);
    res.status(500).json({ message: "Geçmiş dersler getirilemedi." });
  }
};

/** Öğrenci: Ders tamamlandı işareti */
export const completeAppointmentByStudent = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const { id } = req.params;

    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, studentUserId: true, endsAt: true, notes: true },
    });
    if (!appt || appt.studentUserId !== userId) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    if (new Date(appt.endsAt) > new Date()) {
      return res.status(400).json({ message: "Ders saati bitmeden tamamlanamaz." });
    }

    const notes = String(appt.notes || "");
    if (notes.includes("doneStudentAt=")) {
      return res.json({ success: true, already: true });
    }

    const stamp = `doneStudentAt=${new Date().toISOString()}`;
    const updated = await prisma.appointment.update({
      where: { id },
      data: { notes: notes ? `${notes};${stamp}` : stamp },
      select: { id: true, notes: true },
    });

    res.json({ success: true, appointment: updated });
  } catch (e) {
    console.error("completeAppointmentByStudent error:", e);
    res.status(500).json({ message: "Tamamlandı işareti verilemedi." });
  }
};


export const createAppointmentReviewByStudent = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const { id } = req.params; // appointmentId
    const { rating, comment } = req.body || {};
    const rInt = Math.max(1, Math.min(5, Number(rating) || 0));

    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, studentUserId: true, teacherProfileId: true, endsAt: true },
    });
    if (!appt || appt.studentUserId !== userId)
      return res.status(404).json({ message: "Randevu bulunamadı." });

    if (new Date(appt.endsAt) > new Date())
      return res.status(400).json({ message: "Ders bitmeden değerlendirme yapılamaz." });

    // zaten var mı?
    const existing = await prisma.teacherReview.findUnique({ where: { appointmentId: id } }).catch(()=>null);
    if (existing) return res.json({ success: true, review: existing });

    const review = await prisma.teacherReview.create({
      data: {
        appointmentId: id,
        teacherProfileId: appt.teacherProfileId,
        studentId: userId,
        rating: rInt,
        comment: (comment || "").slice(0, 1000),
      },
    });

    // aggregate
    const agg = await prisma.teacherReview.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
      where: { teacherProfileId: appt.teacherProfileId },
    });

    await prisma.teacherProfile.update({
      where: { id: appt.teacherProfileId },
      data: {
        ratingAverage: Math.round((agg._avg.rating || 0) * 10) / 10,
        ratingCount: agg._count.rating || 0,
      },
    });

    return res.status(201).json({ success: true, review });
  } catch (e) {
    console.error("createAppointmentReviewByStudent error:", e);
    return res.status(500).json({ message: "Değerlendirme kaydedilemedi." });
  }
};

