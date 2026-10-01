// "Bugün"/"bu hafta" hesapları öğrencinin takvim gününe (İstanbul, UTC+3,
// DST yok) göre yapılmalı — sunucunun kendi çalışma zaman dilimine (Render
// varsayılan UTC) göre DEĞİL. İkisi arasında her gece 00:00-03:00 İstanbul
// saatinde bir gün farkı oluşabiliyor; bu da hafta Pazar/Pazartesi sınırına
// denk geldiğinde koçun kaydettiği planın yanlış haftaya düşmesine yol
// açabiliyor (canlı testte doğrulandı). Bu yüzden `new Date().getDay()` gibi
// sunucu-yerel-saatine bağımlı metotlar yerine Intl ile İstanbul takvim
// gününü açıkça okuyoruz.
//
// Önceden controllers/studentPanel.controller.js içinde tanımlıydı; AI Soru
// Asistanı'nın günlük kota sınırı da aynı mantığa ihtiyaç duyduğu için buraya
// taşındı (davranış birebir aynı, yalnızca konum değişti).
export const TZ = "Europe/Istanbul";

export const istanbulYMD = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  return { year: map.year, month: map.month, day: map.day };
};

// {year,month,day} İstanbul takvim gününün yerel 00:00'ına karşılık gelen
// UTC anı (İstanbul sabit UTC+3 -> yerel 00:00 = bir önceki günün 21:00 UTC'si).
export const istanbulMidnightUTC = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));

// Pazartesi 00:00'a (İstanbul) normalize eder — StudyPlan.weekStart hep bu çapayla kaydediliyor/aranıyor.
export const toMondayStart = (dateInput) => {
  const { year, month, day } = istanbulYMD(dateInput);
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12)); // öğlen çapası: gün kayması riski yok
  const jsDay = noonUTC.getUTCDay(); // 0=Pazar..6=Cumartesi
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Pazartesi'ye git
  noonUTC.setUTCDate(noonUTC.getUTCDate() + diff);
  return istanbulMidnightUTC({ year: noonUTC.getUTCFullYear(), month: noonUTC.getUTCMonth() + 1, day: noonUTC.getUTCDate() });
};

export const toDayStart = (dateInput) => istanbulMidnightUTC(istanbulYMD(dateInput));

// JS getDay(): 0=Pazar..6=Cumartesi -> StudyPlanItem.dayOfWeek'in
// kullandığı Pazartesi=0 tabanına çevirir. İstanbul takvim gününe göre.
export const todayDayOfWeek = () => {
  const { year, month, day } = istanbulYMD(new Date());
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return (jsDay + 6) % 7;
};
