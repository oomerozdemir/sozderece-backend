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
