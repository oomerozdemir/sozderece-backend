export const createStudentRequest = async (req, res) => {
  try {
    const userId = req.user?.id; // authenticateToken sonrası
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const {
      teacherSlug,
      subject,
      grade,
      mode,         // "ONLINE" | "FACE_TO_FACE"
      city,
      district,
      locationNote,
      note,
    } = req.body || {};

    // Öğretmen bulunur
    const teacher = await prisma.teacherProfile.findUnique({ where: { slug: teacherSlug } });
    if (!teacher || !teacher.isPublic || !teacher.isApproved) {
      return res.status(404).json({ message: "Öğretmen bulunamadı." });
    }

    // BE validasyon – öğretmenin verdiği ders/grade & mod uygun mu?
    if (!teacher.subjects.includes(subject)) {
      return res.status(400).json({ message: "Öğretmen bu dersi vermiyor." });
    }
    if (!teacher.grades.includes(grade)) {
      return res.status(400).json({ message: "Seçilen seviye geçerli değil." });
    }
    const allowedMode = teacher.mode === "BOTH" ? ["ONLINE","FACE_TO_FACE"] : [teacher.mode];
    if (!allowedMode.includes(String(mode))) {
      return res.status(400).json({ message: "Öğretmenin ders modu buna uygun değil." });
    }

    // Yüz yüze ise şehir/ilçe gerekli
    if (mode === "FACE_TO_FACE" && (!city || !district)) {
      return res.status(400).json({ message: "Yüz yüze için şehir ve ilçe gerekli." });
    }

    const rec = await prisma.studentLessonRequest.create({
      data: {
        studentId: userId,
        teacherProfileId: teacher.id,
        subject,
        grade,
        mode,
        city: city || null,
        district: district || null,
        locationNote: locationNote || null,
        note: note || null,
        status: "SUBMITTED"
      }
    });

    res.status(201).json({ success: true, request: rec });
  } catch (e) {
    console.error("createStudentRequest", e);
    res.status(500).json({ message: "Talep oluşturulamadı." });
  }
};


export const getStudentRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) return res.status(404).json({ message: "Bulunamadı." });
    res.json({ success: true, request: rec });
  } catch {
    res.status(500).json({ message: "Hata." });
  }
};


export const attachPackageToRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { packageSlug, packageTitle, unitPrice } = req.body; // unitPrice kuruş

    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) return res.status(404).json({ message: "Bulunamadı." });

    const updated = await prisma.studentLessonRequest.update({
      where: { id },
      data: {
        packageSlug,
        packageTitle,
        packageUnitPrice: Number(unitPrice),
        status: "PACKAGE_SELECTED"
      }
    });

    res.json({ success: true, request: updated });
  } catch {
    res.status(500).json({ message: "Paket ilişkilendirilemedi." });
  }
};


export const markRequestPaid = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { orderId } = req.body;

    const rec = await prisma.studentLessonRequest.findUnique({ where: { id } });
    if (!rec || rec.studentId !== userId) return res.status(404).json({ message: "Bulunamadı." });

    const updated = await prisma.studentLessonRequest.update({
      where: { id },
      data: { status: "PAID", orderId }
    });

    res.json({ success: true, request: updated });
  } catch {
    res.status(500).json({ message: "Durum güncellenemedi." });
  }
};
