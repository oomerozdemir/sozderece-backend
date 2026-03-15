import prisma from "../utils/prisma.js";

// Public: Belirli bir tarih için bloke edilmiş slotları döner
export const getConsultationSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.json({ blockedSlots: [] });
    }

    const slots = await prisma.consultationSlot.findMany({
      where: { date, isBlocked: true },
      select: { timeSlot: true },
    });

    return res.json({ blockedSlots: slots.map((s) => s.timeSlot) });
  } catch (error) {
    console.error("getConsultationSlots hatası:", error);
    return res.status(500).json({ blockedSlots: [] });
  }
};

// Admin: Belirli bir tarih için tüm slotların durumunu döner
export const getAdminConsultationSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date parametresi gerekli" });
    }

    const blockedRecords = await prisma.consultationSlot.findMany({
      where: { date, isBlocked: true },
      select: { timeSlot: true },
    });

    const blockedSet = new Set(blockedRecords.map((r) => r.timeSlot));
    return res.json({ blockedSlots: [...blockedSet] });
  } catch (error) {
    console.error("getAdminConsultationSlots hatası:", error);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Admin: Tek slot toggle (dolu/boş)
export const toggleConsultationSlot = async (req, res) => {
  try {
    const { date, timeSlot, isBlocked } = req.body;
    if (!date || !timeSlot || isBlocked === undefined) {
      return res.status(400).json({ message: "date, timeSlot ve isBlocked gerekli" });
    }

    if (isBlocked) {
      // Dolu yap: upsert ile kaydet
      await prisma.consultationSlot.upsert({
        where: { date_timeSlot: { date, timeSlot } },
        update: { isBlocked: true },
        create: { date, timeSlot, isBlocked: true },
      });
    } else {
      // Boş yap: kaydı sil (varsa)
      await prisma.consultationSlot.deleteMany({
        where: { date, timeSlot },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("toggleConsultationSlot hatası:", error);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Admin: Toplu işlem - tüm slotları dolu veya boş yap
export const bulkUpdateConsultationSlots = async (req, res) => {
  try {
    const { date, slots, isBlocked } = req.body;
    if (!date || !Array.isArray(slots) || isBlocked === undefined) {
      return res.status(400).json({ message: "date, slots[] ve isBlocked gerekli" });
    }

    if (isBlocked) {
      // Toplu dolu yap
      await prisma.$transaction(
        slots.map((timeSlot) =>
          prisma.consultationSlot.upsert({
            where: { date_timeSlot: { date, timeSlot } },
            update: { isBlocked: true },
            create: { date, timeSlot, isBlocked: true },
          })
        )
      );
    } else {
      // Toplu boş yap
      await prisma.consultationSlot.deleteMany({
        where: { date, timeSlot: { in: slots } },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("bulkUpdateConsultationSlots hatası:", error);
    return res.status(500).json({ message: "Sunucu hatası" });
  }
};
