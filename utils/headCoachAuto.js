import prisma from "./prisma.js";

// Ana Koç ataması artık admin'in koç-koç "Ana Koç" dropdown'unu elle
// doldurmasını gerektirmiyor — kullanıcı talebiyle otomatikleştirildi:
// "ana koç olarak atadığım kişi otomatik olarak tüm koçlar onun bünyesine
// girsin". Tasarım tek-aktif-Ana-Koç varsayıyor (birden fazla head_coach
// varsa hangi takımın "otomatik" olacağı belirsizleşir, o yüzden
// getSoleHeadCoachUserId() yalnızca TAM OLARAK bir head_coach varken bir
// id döner) — birden fazla Ana Koç gerekiyorsa admin hâlâ mevcut per-coach
// dropdown'dan elle override edebilir, bu otomasyon onu KALDIRMIYOR.

// Biri head_coach yapıldığında (yeni oluşturulsun ya da rolü değiştirilsin)
// sistemdeki TÜM koçları o kişinin bünyesine alır.
export async function autoAssignAllCoachesToHeadCoach(headCoachUserId) {
  await prisma.coach.updateMany({ data: { headCoachUserId } });
}

// Sistemde TAM OLARAK bir head_coach varsa onun User.id'sini döner — yoksa
// ya da birden fazlaysa null (yeni koç oluşturulurken otomatik atama için).
export async function getSoleHeadCoachUserId() {
  const headCoaches = await prisma.user.findMany({ where: { role: "head_coach" }, select: { id: true } });
  return headCoaches.length === 1 ? headCoaches[0].id : null;
}
