export const PACKAGE_CATALOG = [
  { key: "ozel-ders-plus-hazir-2026", aliases: ["Özel Ders Plus Hazır 2026"], freeLessons: 1, period: "once" },
  { key: "kocluk-ozel-ders-2026",     aliases: ["Koçluk + Özel Ders 2026"],  freeLessons: 2, period: "monthly" },
];
export const getPackageConfig = (nameOrKey) => {
  if (!nameOrKey) return null;
  const needle = String(nameOrKey).trim().toLowerCase();
  return PACKAGE_CATALOG.find(p =>
    p.key.toLowerCase() === needle ||
    (p.aliases||[]).some(a => String(a).toLowerCase() === needle)
  ) || null;
};
