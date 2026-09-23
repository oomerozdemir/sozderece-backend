import prisma from "./prisma.js";

const SETTINGS_KEY = "onboardingForm";

// Soru tipleri: text | tel | textarea | single | multi.
// exam: null (herkes) | "YKS" | "LGS" — aynı key iki kez, farklı exam ile tanımlanabilir.
// "Diğer" seçeneği olan bir multi sorusunun serbest metni `${key}Other` anahtarında tutulur.
const Q = (key, type, label, extra = {}) => ({ key, type, label, hint: "", required: false, options: [], exam: null, ...extra });

// Bu 4 soru olmadan koç öğrenciye ulaşamaz / dallanma çalışmaz: silinemez, sadece
// metni (label/hint) düzenlenebilir; tipi ve seçenekleri sabit.
export const CORE_KEYS = ["fullName", "phone", "respondent", "exam"];

export const DEFAULT_FORM = {
  steps: [
    {
      title: "Seni Tanıyalım",
      heading: "Önce seni tanıyalım.",
      description: "Bu bilgiler koçunun seni ve sınav sürecini daha iyi tanımasına yardımcı olacak.",
      questions: [
        Q("fullName", "text", "Ad Soyad", { required: true }),
        Q("phone", "tel", "Telefon / WhatsApp numarası", { hint: "Koçun sana buradan ulaşacak.", required: true }),
        Q("respondent", "single", "Öğrenci misin / Veli misin?", { required: true, options: ["ogrenci", "veli"] }),
        Q("exam", "single", "Hangi sınava hazırlanıyorsun?", { required: true, options: ["YKS", "LGS"] }),
      ],
    },
    {
      title: "Hedefin",
      heading: "Nereye ulaşmak istiyorsun?",
      description: "Net bir hedefin yoksa sorun değil, boş bırakabilirsin.",
      questions: [
        Q("grade", "single", "Sınıf / durum", { exam: "YKS", options: ["12. sınıf", "Mezun", "Diğer"] }),
        Q("grade", "single", "Sınıf", { exam: "LGS", options: ["5. sınıf", "6. sınıf", "7. sınıf", "8. sınıf"] }),
        Q("field", "single", "Alan", { exam: "YKS", options: ["Sayısal", "Eşit Ağırlık", "Sözel", "Dil"] }),
        Q("targetSchool", "textarea", "Hedeflediğin bölüm / üniversite var mı?", { hint: "Opsiyonel", exam: "YKS" }),
        Q("targetSchool", "textarea", "Hedeflediğin lise/liseler var mı?", { hint: "Opsiyonel", exam: "LGS" }),
        Q("targetRank", "text", "Hedef sıralaman varsa yaz.", { hint: "Opsiyonel", exam: "YKS" }),
        Q("targetRank", "text", "Hedef puanın veya yüzdelik dilimin varsa yaz.", { hint: "Opsiyonel", exam: "LGS" }),
      ],
    },
    {
      title: "Şu An Neredesin?",
      heading: "Şimdi başlangıç noktanı anlayalım.",
      description: "",
      questions: [
        Q("challenges", "multi", "Şu anda sınav sürecinde seni en çok zorlayan şeyler neler?", {
          hint: "Birden fazla seçebilirsin.",
          options: [
            "Nereden başlayacağımı bilmiyorum",
            "Program yapıyorum ama sürdüremiyorum",
            "Günümü planlamakta zorlanıyorum",
            "Düzenli çalışamıyorum",
            "Eksiklerimi nasıl kapatacağımı bilmiyorum",
            "Zorlandığım dersleri erteliyorum",
            "Deneme sonuçlarımı nasıl değerlendireceğimi bilmiyorum",
            "Çalışıyorum ama doğru ilerlediğimden emin değilim",
            "Diğer",
          ],
        }),
        Q("routine", "single", "Şu an çalışma düzenini nasıl tanımlarsın?", {
          options: ["Düzenli çalışıyorum", "Bazen düzenli çalışıyorum", "Oldukça dağınık ilerliyorum", "Henüz bir çalışma düzenim yok"],
        }),
        Q("dailyHours", "single", "Günde ortalama ne kadar çalışıyorsun?", {
          options: ["Henüz düzenli çalışmıyorum", "1 saatten az", "1–2 saat", "2–4 saat", "4 saat+"],
        }),
        Q("lastExam", "text", "Son deneme netin veya sıralaman", { hint: "Opsiyonel", exam: "YKS" }),
        Q("lastExam", "text", "Son denemenin puanı / neti", { hint: "Opsiyonel", exam: "LGS" }),
      ],
    },
    {
      title: "Koçun Seni Tanısın",
      heading: "Son olarak, koçunun seni biraz daha tanımasına yardım et.",
      description: "",
      questions: [
        Q("supports", "multi", "Koçluktan en çok hangi konularda destek almak istiyorsun?", {
          hint: "Birden fazla seçebilirsin.",
          options: [
            "Bana uygun çalışma programı",
            "Düzenli takip",
            "Zaman yönetimi",
            "Deneme analizi",
            "Eksiklerimi belirleme",
            "Çalışma düzeni oluşturma",
            "Zorlandığım dersleri yönetme",
            "Süreç boyunca yönlendirilme",
          ],
        }),
        Q("note", "textarea", "Koçunun senin hakkında mutlaka bilmesini istediğin bir şey var mı?", {
          hint: "Çalışma alışkanlığın, okul programın, zorlandığın bir durum veya süreçten beklentin olabilir. (Opsiyonel)",
        }),
      ],
    },
  ],
};

const TYPES = ["text", "tel", "textarea", "single", "multi"];
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function getOnboardingForm() {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { key: SETTINGS_KEY } });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      const checked = validateForm(parsed);
      if (checked.form) return checked.form;
    }
  } catch (e) {
    console.warn("onboarding form okunamadı, varsayılan kullanılıyor:", e?.message);
  }
  return DEFAULT_FORM;
}

export async function saveOnboardingForm(form) {
  const value = JSON.stringify(form);
  await prisma.siteSettings.upsert({ where: { key: SETTINGS_KEY }, update: { value }, create: { key: SETTINGS_KEY, value } });
}

export async function resetOnboardingForm() {
  await prisma.siteSettings.deleteMany({ where: { key: SETTINGS_KEY } });
}

// Admin'den gelen formu doğrular ve normalize eder → { form } | { error }.
export function validateForm(input) {
  const steps = input?.steps;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 8) return { error: "1–8 arası adım olmalı." };

  const coreDefaults = {};
  DEFAULT_FORM.steps.forEach((s) => s.questions.forEach((q) => { if (CORE_KEYS.includes(q.key)) coreDefaults[q.key] = q; }));

  const seen = new Set();
  const outSteps = [];
  for (const [si, s] of steps.entries()) {
    const qs = Array.isArray(s?.questions) ? s.questions : [];
    if (qs.length > 20) return { error: `Adım ${si + 1}: en fazla 20 soru.` };
    const questions = [];
    for (const q of qs) {
      const key = String(q?.key || "");
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key)) return { error: `Geçersiz soru anahtarı: ${key}` };
      const exam = q.exam === "YKS" || q.exam === "LGS" ? q.exam : null;
      const label = clip(q.label, 300);
      if (!label) return { error: "Boş soru metni olamaz." };
      const core = coreDefaults[key];
      let type = q.type;
      let options = [];
      let required = !!q.required;
      if (core) {
        type = core.type;
        options = core.options;
        required = true;
      } else {
        if (!TYPES.includes(type)) return { error: `Geçersiz soru tipi (${label}).` };
        if (type === "single" || type === "multi") {
          options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => clip(o, 120)).filter(Boolean))];
          if (options.length < 2 || options.length > 20) return { error: `"${label}" için 2–20 arası seçenek gerekli.` };
        }
      }
      seen.add(key);
      questions.push({ key, type, label, hint: clip(q.hint, 400), required, options, exam: core ? null : exam });
    }
    outSteps.push({ title: clip(s.title, 60) || `Adım ${si + 1}`, heading: clip(s.heading, 200), description: clip(s.description, 400), questions });
  }
  for (const k of CORE_KEYS) if (!seen.has(k)) return { error: "Ad soyad, telefon, öğrenci/veli ve sınav soruları silinemez." };
  // Çekirdek sorular tek bir adımda, herkese görünür olmalı (kullanıcı sınav seçmeden dallanma çalışmaz).
  return { form: { steps: outSteps } };
}

// Bir soru tüm formda hangi anahtarlar için hangi seçenekleri kabul ediyor (exam'den bağımsız birleşim).
export function questionIndex(form) {
  const map = new Map();
  for (const s of form.steps) {
    for (const q of s.questions) {
      const cur = map.get(q.key) || { key: q.key, type: q.type, options: new Set() };
      q.options.forEach((o) => cur.options.add(o));
      map.set(q.key, cur);
    }
  }
  return map;
}
