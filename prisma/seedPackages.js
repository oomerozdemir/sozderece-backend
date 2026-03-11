import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const packages = [
  {
    slug: "tek-ders-kocluk-2026",
    name: "YKS/LGS Tek Derse Özel Koçluk",
    description: "Tam kapsamlı koçluktan tek farkı gelişmek istediğiniz tek bir derse koçunuzla hazırlanın!",
    price: 1500,
    unitPrice: 150000,
    priceText: "1500₺ / ay",
    oldPriceText: null,
    subtitle: "Tam kapsamlı koçluktan tek farkı gelişmek istediğiniz tek bir derse koçunuzla hazırlanın!",
    type: "hybrid_light",
    hidden: false,
    displayOrder: 1,
    ctaLabel: "Paketi seç",
    ctaHref: "/pre-auth?slug=tek-ders-kocluk-2026",
    features: [
      { label: "Kişiye Özel Seçtiği Dersten Koçluk Programı", included: true },
      { label: "7/24 WhatsApp Desteği", included: true },
      { label: "Günlük Takip Ve Durum Analizi", included: true },
      { label: "Haftada Bir Koçunla Görüşme Ve Durum Analizi", included: true },
      { label: "Özel Ders Paket İçeriği", included: false },
    ],
    note: "Sadece tek bir derse özel koçluk. Seçtiğiniz dersten size özel tam kapsamlı koçluk imkanı",
    freeLessons: null,
  },
  {
    slug: "kocluk-2026",
    name: "YKS/LGS Tam Kapsamlı Koçluk Paketi",
    description: "Sana özel program, hedef takibi, düzenli görüşmeler ve performans raporları.",
    price: 2500,
    unitPrice: 250000,
    priceText: "2500₺ / ay",
    oldPriceText: null,
    subtitle: "Sana özel program, hedef takibi, düzenli görüşmeler ve performans raporları.",
    type: "coaching_only",
    hidden: false,
    displayOrder: 2,
    ctaLabel: "Paketi seç",
    ctaHref: "/pre-auth?slug=kocluk-2026",
    features: [
      { label: "Kişiye Özel Tam Kapsamlı Koçluk Programı", included: true },
      { label: "Haftada Bir Koçunla Online Görüşme", included: true },
      { label: "7/24 WhatsApp Desteği", included: true },
      { label: "Günlük Takip Ve Durum Analizi", included: true },
    ],
    note: "Bu pakette tam kapsamlı koçluk vardır. Özel ders hakkı tanınmamaktadır.",
    freeLessons: null,
  },
  {
    slug: "kocluk-ozel-ders-2026",
    name: "YKS/LGS Tam Kapsamlı Koçluk + Özel Ders Paketi",
    description: "Tam kapsamlı koçluk + her ay ücretsiz 2 özel ders hakkı.",
    price: 3800,
    unitPrice: 380000,
    priceText: "3800₺ / ay",
    oldPriceText: null,
    subtitle: "Tam kapsamlı koçluk + her ay ücretsiz 2 özel ders hakkı: hem düzenli takip hem de eksik konularda birebir destek.",
    type: "coaching_plus_tutoring",
    hidden: false,
    displayOrder: 3,
    ctaLabel: "Paketi seç",
    ctaHref: "/pre-auth?slug=kocluk-ozel-ders-2026",
    features: [
      { label: "Kişiye Özel Tam Kapsamlı Koçluk Programı", included: true },
      { label: "Haftada Bir Koçunla Görüşme", included: true },
      { label: "7/24 WhatsApp Desteği", included: true },
      { label: "Günlük Takip Ve Durum Analizi", included: true },
      { label: "Seçtiğin Öğretmenden Ücretsiz 2 Özel Ders Hakkı", included: true },
      { label: "Özel Ders Paket İçeriği", included: true },
    ],
    note: "Bu pakette tam kapsamlı koçluk + ücretsiz 3 özel ders hakkı tanınmaktadır.",
    freeLessons: 2,
  },
];

async function main() {
  console.log("Paketler seed ediliyor...");
  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { slug: pkg.slug },
      update: pkg,
      create: pkg,
    });
    console.log(`✅ ${pkg.name}`);
  }
  console.log("Seed tamamlandı.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
