import prisma from "../utils/prisma.js";

import bcrypt from "bcrypt";
import slugify from "slugify";
import { generateToken } from "../middleware/authMiddleware.js";
import { createVerificationCode } from "../services/verificationService.js";
import { sendAppointmentConfirmedToStudent } from "../utils/sendEmail.js";

import { DateTime } from "luxon";
import { isBefore } from "date-fns";

const parseRequestId = (notes = "") => {
  const m = /requestId=([a-z0-9]+)/i.exec(String(notes) || "");
  return m?.[1] || null;
};

// İptal/iade: Ücretsiz hak iadesi (count kadar)
async function refundFreeRightByRequestId(tx, requestId, count = 1) {
  if (!requestId || count <= 0) return false;

  const reqRow = await tx.studentLessonRequest.findUnique({
    where: { id: String(requestId) },
    select: { id: true, studentId: true, packageSlug: true, packageUnitPrice: true },
  });
  if (!reqRow) return false;

  // Paket/ücretsiz talep mi?
  const isFree = !!reqRow.packageSlug || Number(reqRow.packageUnitPrice) === 0;
  if (!isFree) return false;

  // Öğrencinin ilgili (veya en güncel) aktif hakkını bul
  const right = await tx.studentPackageRight.findFirst({
    where: {
      studentId: reqRow.studentId,
      isActive: true,
      ...(reqRow.packageSlug ? { packageSlug: reqRow.packageSlug } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!right) return false;

  // Negatife düşmeyi engellemek istersen Math.min kullanabilirsin
  await tx.studentPackageRight.update({
    where: { id: right.id },
    data: { rightsUsed: { decrement: count } },
  });
  return true;
}


// Tek bir overlap helper yeterli
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function makeSlug(firstName, lastName) {
  const base = slugify(`${firstName}-${lastName}`, { lower: true, strict: true });
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${rnd}`;
}


/** Öğretmen kayıt (şifreli) */
export const registerTeacher = async (req, res) => {
  try {
    let {
      firstName,
      lastName,
      email,
      password,
      phone,
      subjects = [],
      grades = [],
      city,
      district,
      mode,
      bio,
      whyMe,
      photoUrl
    } = req.body || {};

    // --- Zorunlu kontroller ---
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password || !firstName || !lastName) {
      return res
        .status(400)
        .json({ success: false, message: "Zorunlu alanlar eksik." });
    }

    // E-posta tekil mi?
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res
        .status(400)
        .json({ success: false, message: "Bu e-posta zaten kayıtlı." });
    }

    // --- Normalize ---
    firstName = String(firstName).trim();
    lastName  = String(lastName).trim();
    city      = typeof city === "string" ? city.trim() : city;
    district  = typeof district === "string" ? district.trim() : district;

    const normArray = (arr) =>
      Array.isArray(arr)
        ? Array.from(
            new Set(
              arr
                .filter((x) => typeof x === "string")
                .map((x) => x.trim())
                .filter(Boolean)
            )
          )
        : [];

    subjects = normArray(subjects);
    grades   = normArray(grades);

    const allowedModes = new Set(["ONLINE", "FACE_TO_FACE", "BOTH"]);
    const normMode = (() => {
      const m = String(mode || "BOTH").toUpperCase().trim();
      return allowedModes.has(m) ? m : "BOTH";
    })();

    bio = typeof bio === "string" ? bio.trim() : null;
    whyMe = typeof whyMe === "string" ? whyMe.trim() : null;
    photoUrl = typeof photoUrl === "string" ? photoUrl.trim() : null;

    // --- Kullanıcı oluştur ---
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`.trim(),
        email: normalizedEmail,
        password: hashed,
        role: "teacher",
        phone: phone || null,
        emailVerified: true,
        isVerified: true
      },
      select: { id: true, email: true, role: true, name: true }
    });

    // --- Profil oluştur (FİYATLAR YOK) ---
    const slug = makeSlug(firstName, lastName);

    const profile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        firstName,
        lastName,
        subjects,
        grades,
        city,
        district,
        mode: normMode,
        bio,
        whyMe,
        photoUrl,
        slug,
        isPublic: true
      }
    });

   
    // --- JWT ---
    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({
      success: true,
      message: "Öğretmen kaydı tamamlandı.",
      token,
      user,
      profile
    });
  } catch (err) {
    console.error("registerTeacher error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Kayıt başarısız." });
  }
};



/** Öğretmen giriş (şifreli) */
export const loginTeacher = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.role !== "teacher") {
      return res.status(401).json({ success: false, message: "Öğretmen bulunamadı." });
    }

    const ok = await bcrypt.compare(password || "", user.password || "");
    if (!ok) {
      return res.status(401).json({ success: false, message: "Şifre hatalı." });
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } });

    return res.status(200).json({ success: true, token, user: { id: user.id, email: user.email, role: user.role }, profile });
  } catch (err) {
    console.error("loginTeacher error:", err);
    return res.status(500).json({ success: false, message: "Giriş başarısız." });
  }
};

/** Öğretmen – kendi profilini getir */
export const getMyTeacherProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: "Profil bulunamadı." });
    return res.json({ success: true, profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
};

/** Öğretmen – profil güncelle */
export const updateMyTeacherProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = (req.user?.role || "").toLowerCase();
    if (!userId || role !== "teacher") {
      return res.status(403).json({ success: false, message: "Yetkisiz işlem." });
    }

    let {
      firstName,
      lastName,
      subjects,
      grades,
      city,
      district,
      mode,        // "ONLINE" | "FACE_TO_FACE" | "BOTH"
      bio,
      photoUrl,
      whyMe,
      isPublic
    } = req.body || {};

    // --- Normalizasyon / Validasyon ---

    // İsimler
    if (typeof firstName === "string") firstName = firstName.trim();
    if (typeof lastName === "string")  lastName  = lastName.trim();
    if (typeof whyMe === "string") whyMe = whyMe.trim();

    // Dizi alanlar
    const normArray = (arr) =>
      Array.isArray(arr)
        ? Array.from(
            new Set(
              arr
                .filter((x) => typeof x === "string")
                .map((x) => x.trim())
                .filter(Boolean)
            )
          )
        : undefined;

    const normSubjects = normArray(subjects);
    const normGrades   = normArray(grades);

    // Şehir / İlçe
    if (typeof city === "string")     city     = city.trim();
    if (typeof district === "string") district = district.trim();

    // Mod
    const allowedModes = new Set(["ONLINE", "FACE_TO_FACE", "BOTH"]);
    if (typeof mode === "string") {
      mode = mode.trim().toUpperCase();
      if (!allowedModes.has(mode)) {
        return res.status(400).json({ success: false, message: "Geçersiz ders modu." });
      }
    } else {
      mode = undefined;
    }

    // Bio / Foto
    if (typeof bio === "string")      bio = bio.trim();
    if (typeof photoUrl === "string") photoUrl = photoUrl.trim();

    // Yayın durumu
    if (typeof isPublic !== "undefined") {
      isPublic = Boolean(isPublic);
    } else {
      isPublic = undefined;
    }

    // --- Güncellenecek veri seti (fiyat YOK) ---
    const data = {
      ...(firstName     !== undefined && { firstName }),
      ...(lastName      !== undefined && { lastName }),
      ...(normSubjects  !== undefined && { subjects: normSubjects }),
      ...(normGrades    !== undefined && { grades: normGrades }),
      ...(city          !== undefined && { city }),
      ...(district      !== undefined && { district }),
      ...(mode          !== undefined && { mode }),
      ...(bio           !== undefined && { bio }),
      ...(whyMe    !== undefined && { whyMe }),
      ...(photoUrl      !== undefined && { photoUrl }),
      ...(isPublic      !== undefined && { isPublic }),
    };

    // Kayıt var mı?
    const exists = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!exists) {
      return res.status(404).json({ success: false, message: "Profil bulunamadı." });
    }

    const updated = await prisma.teacherProfile.update({
      where: { userId },
      data
    });

    // İsim değiştiyse User.name’i güncelle
    if (firstName !== undefined || lastName !== undefined) {
      const newFirst = firstName ?? updated.firstName;
      const newLast  = lastName  ?? updated.lastName;
      const full     = `${newFirst || ""} ${newLast || ""}`.trim();
      await prisma.user.update({
        where: { id: userId },
        data: { name: full || null }
      });
    }

    return res.json({ success: true, profile: updated });
  } catch (err) {
    console.error("updateMyTeacherProfile error:", err);
    return res.status(500).json({ success: false, message: "Güncelleme başarısız." });
  }
};



/** Public – listeleme/arama */
export const searchTeachers = async (req, res) => {
  try {
    const {
      city, district, subject, grade, mode, q,
      page = 1, limit = 20,
      minPrice, maxPrice, sort
    } = req.query;

    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(limit) || 20, 50);

    // ---- temel filtreler (fiyat filtrelemesini türetilmiş değerle JS tarafında yapacağız) ----
    const where = {
  isPublic: true,
  publishStatus: "APPROVED",   
  ...(city ? { city } : {}),
  ...(district ? { district } : {}),
  ...(mode ? { mode } : {}),
  ...(subject ? { subjects: { has: subject } } : {}),
  ...(grade ? { grades: { has: grade } } : {}),
  ...(q ? {
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName:  { contains: q, mode: "insensitive" } },
      { bio:       { contains: q, mode: "insensitive" } },
    ],
  } : {}),
  ...(minPrice || maxPrice ? priceFilter : {}),
};

    // ---- veriyi çek (derslerle birlikte) ----
    const rows = await prisma.teacherProfile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }], // fallback sıralama
      select: {
        id: true, firstName: true, lastName: true, subjects: true, grades: true,
        city: true, district: true, mode: true,
        photoUrl: true, slug: true, viewCount: true,
        ratingAverage: true, ratingCount: true,
        // profil üzerindeki eski fiyatlar (fallback)
        priceOnline: true, priceF2F: true,
        // 🔑 Dersler: burada 'mode' ve 'price' yok; priceOnline/priceF2F var
        lessons: {
          where: {
            // isActive alanın varsa aktif dersleri filtreleyebilirsin:
            // isActive: true
          },
          select: { priceOnline: true, priceF2F: true, isActive: true },
        },
      },
    });

    // ---- yardımcılar ----
    const normalizeTL = (val) => {
      if (val == null) return undefined;
      const n = Number(val);
      if (!Number.isFinite(n)) return undefined;
      // değer kuruş bazında tutuluyorsa (ör. 120000) basit bir heuristik:
      return n >= 100000 ? Math.round(n / 100) : n;
    };

    // Derslerden min ONLINE / min F2F fiyatını çıkar
    const materialize = (t) => {
      let minOnline;
      let minF2F;

      for (const l of (t.lessons || [])) {
        const pOn  = Number(l.priceOnline);
        const pF2F = Number(l.priceF2F);

        if (Number.isFinite(pOn))  minOnline = (minOnline == null) ? pOn  : Math.min(minOnline, pOn);
        if (Number.isFinite(pF2F)) minF2F    = (minF2F    == null) ? pF2F : Math.min(minF2F, pF2F);
      }

      const priceOnlineFromLessons = normalizeTL(minOnline);
      const priceF2FFromLessons    = normalizeTL(minF2F);

      // türev bulunamazsa profil fiyatlarına düş
      let priceOnline = priceOnlineFromLessons ?? normalizeTL(t.priceOnline) ?? null;
      let priceF2F    = priceF2FFromLessons    ?? normalizeTL(t.priceF2F)    ?? null;


        // 0 veya negatif değerleri “yok” kabul et
      if (!(priceOnline > 0)) priceOnline = null;
      if (!(priceF2F > 0))    priceF2F    = null;
      // Öğretmenin seçtiği moda göre karşı modu gizle
      if (t.mode === "ONLINE")       priceF2F = null;
      else if (t.mode === "FACE_TO_FACE") priceOnline = null;

      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        subjects: t.subjects,
        grades: t.grades,
        city: t.city,
        district: t.district,
        mode: t.mode,
        photoUrl: t.photoUrl,
        slug: t.slug,
        viewCount: t.viewCount,
        ratingAverage: t.ratingAverage,
        ratingCount: t.ratingCount,
        priceOnline,
        priceF2F,
      };
    };

    let itemsAll = rows.map(materialize);

    // ---- fiyat filtresi (türetilmiş fiyat üzerinden) ----
    const minP = (minPrice != null) ? Number(minPrice) : null;
    const maxP = (maxPrice != null) ? Number(maxPrice) : null;

    if (minP != null || maxP != null) {
      const inRange = (v) => {
        if (v == null) return false;
        if (minP != null && v < minP) return false;
        if (maxP != null && v > maxP) return false;
        return true;
      };

      if (mode === "ONLINE") {
        itemsAll = itemsAll.filter(t => inRange(t.priceOnline));
      } else if (mode === "FACE_TO_FACE") {
        itemsAll = itemsAll.filter(t => inRange(t.priceF2F));
      } else {
        // iki moddan en az biri aralığa uyuyorsa geçir
        itemsAll = itemsAll.filter(t => inRange(t.priceOnline) || inRange(t.priceF2F));
      }
    }

    // ---- sıralama ----
    const sortByNumber = (arr, key, dir = "asc") => {
      const s = [...arr].sort((a, b) => {
        const va = a[key]; const vb = b[key];
        const aa = (va == null) ? Number.POSITIVE_INFINITY : Number(va);
        const bb = (vb == null) ? Number.POSITIVE_INFINITY : Number(vb);
        return dir === "asc" ? (aa - bb) : (bb - aa);
      });
      return s;
    };

    if (sort === "most_viewed") {
      itemsAll.sort((a, b) =>
        (b.viewCount || 0) - (a.viewCount || 0)
        || (b.ratingAverage || 0) - (a.ratingAverage || 0)
        || (b.ratingCount || 0) - (a.ratingCount || 0)
      );
    } else if (sort === "top_rated") {
      itemsAll.sort((a, b) =>
        (b.ratingAverage || 0) - (a.ratingAverage || 0)
        || (b.ratingCount || 0) - (a.ratingCount || 0)
        || (b.viewCount || 0) - (a.viewCount || 0)
      );
    } else if (sort === "priceOnline_asc") {
      itemsAll = sortByNumber(itemsAll, "priceOnline", "asc");
    } else if (sort === "priceOnline_desc") {
      itemsAll = sortByNumber(itemsAll, "priceOnline", "desc");
    } else if (sort === "priceF2F_asc") {
      itemsAll = sortByNumber(itemsAll, "priceF2F", "asc");
    } else if (sort === "priceF2F_desc") {
      itemsAll = sortByNumber(itemsAll, "priceF2F", "desc");
    }
    // aksi halde DB'deki createdAt desc sırası korunur

    // ---- sayfalama ----
    const total = itemsAll.length;
    const start = (pageNum - 1) * perPage;
    const end   = start + perPage;
    const items = itemsAll.slice(start, end);

    return res.json({ success: true, page: pageNum, total, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Listeleme hatası." });
  }
};



/** Public – tek öğretmen sayfası */
export const getTeacherBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const item = await prisma.teacherProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        slug: true,
        isPublic: true,
        publishStatus: true,          // moderasyon varsa
        mode: true,
        city: true,
        district: true,
        subjects: true,
        grades: true,
        bio: true,
        photoUrl: true,
        priceOnline: true,
        priceF2F: true,
        ratingAverage: true,
        ratingCount: true,
        viewCount: true,
        lessons: {
          where: { isActive: true },  // isActive alanınız yoksa bu satırı kaldırın
          select: { subject: true, priceOnline: true, priceF2F: true },
        },
        user: { select: { id: true, name: true, emailVerified: true } },
      },
    });

    // Yayın kontrolü: isPublic şart, publishStatus varsa APPROVED olmalı
    if (
      !item ||
      !item.isPublic ||
      (item.publishStatus && item.publishStatus !== "APPROVED")
    ) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }

    return res.json({ success: true, teacher: item });
  } catch (err) {
    console.error("getTeacherBySlug error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
};



export const trackTeacherView = async (req, res) => {
  try {
    const { slug } = req.params;

    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        isPublic: true,
        publishStatus: true,   // ✅ moderasyon durumu
        viewCount: true,
        userId: true,
      },
    });

    // Yayın kontrolü: isPublic + (varsa) publishStatus=APPROVED
    if (
      !teacher ||
      !teacher.isPublic ||
      (teacher.publishStatus && teacher.publishStatus !== "APPROVED")
    ) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }

    // (Opsiyonel) kendi profiline bakıyorsa sayaç artırma
    if (req.user && Number(req.user.id) === teacher.userId) {
      return res.json({ success: true, viewCount: teacher.viewCount });
    }

    const updated = await prisma.teacherProfile.update({
      where: { id: teacher.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    return res.json({ success: true, viewCount: updated.viewCount });
  } catch (err) {
    console.error("trackTeacherView error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Görüntüleme sayısı güncellenemedi." });
  }
};



export const addTeacherReview = async (req, res) => {
  try {
    const { slug } = req.params;

    const item = await prisma.teacherProfile.findUnique({ where: { slug } });
    if (
      !item ||
      !item.isPublic ||
      (item.publishStatus && item.publishStatus !== "APPROVED")
    ) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }

    const userId = req.user?.id || null;
    const { rating, comment } = req.body;

    await prisma.teacherReview.create({
      data: {
        teacherProfileId: item.id,
        userId,
        rating: Number(rating) || 0,
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("addTeacherReview error:", err);
    res.status(500).json({ success: false, message: "Yorum eklenemedi." });
  }
};

export const listTeacherReviews = async (req, res) => {
  try {
    const { slug } = req.params;
    const item = await prisma.teacherProfile.findUnique({ where: { slug } });
    if (!item) return res.status(404).json({ success: false, message: "Öğretmen yok." });

    const reviews = await prisma.teacherReview.findMany({
      where: { teacherProfileId: item.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json({ success: true, reviews });
  } catch {
    res.status(500).json({ success: false, message: "Değerlendirmeler alınamadı." });
  }
};


export const resendTeacherEmailCode = async (req, res) => {
  try {
    const userId = req.user?.id; 
    if (!userId) return res.status(401).json({ message: "Yetkisiz." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });

    await createVerificationCode({
      userId,
      type: "email",
      target: user.email,
    });

    res.json({ success: true, message: "Kod gönderildi." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || "Kod gönderilemedi." });
  }
};

export const verifyTeacherEmailCode = async (req, res) => {
  try {
    const userId = req.user?.id; 
    const { code } = req.body;
    if (!userId) return res.status(401).json({ message: "Yetkisiz." });
    if (!code) return res.status(400).json({ message: "Kod gerekli." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });

    await verifyCode({
      userId,
      type: "email",
      target: user.email,
      code: String(code).trim(),
    });

    
    const fresh = await prisma.user.findUnique({ where: { id: userId } });

    res.json({ success: true, message: "E-posta doğrulandı.", user: fresh });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || "Kod doğrulanamadı." });
  }
};


export const uploadTeacherPhoto = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Yetkisiz." });

    // Multer + CloudinaryStorage ile gelen dosya bilgisi
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Fotoğraf gerekli." });

    const url = file.secure_url || file.path;
    if (!url) return res.status(500).json({ success: false, message: "Yükleme başarısız." });

    const updated = await prisma.teacherProfile.update({
      where: { userId },
      data: { photoUrl: url },
      select: {
        id: true, firstName: true, lastName: true, photoUrl: true, slug: true,
        city: true, district: true, mode: true, priceOnline: true, priceF2F: true
      }
    });

    return res.json({ success: true, profile: updated });
  } catch (e) {
    console.error("uploadTeacherPhoto error:", e);
    return res.status(500).json({ success: false, message: "Fotoğraf kaydedilemedi." });
  }
};



// ---  Haftalık uygunluk GET ---
export const getMyAvailability = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, timeZone: true, availabilities: true }
    });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });
    res.json({ success: true, timeZone: teacher.timeZone, items: teacher.availabilities });
  } catch (e) {
    res.status(500).json({ success: false, message: "Uygunluk alınamadı." });
  }
};


// --- Haftalık uygunluk PUT (tam set) ---
export const upsertMyAvailability = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { timeZone, items = [] } = req.body; // items: {weekday, startMin, endMin, mode, isActive}[]
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    // hepsini sil-yeniden ekle 
    await prisma.teacherAvailability.deleteMany({ where: { teacherProfileId: teacher.id } });

    if (Array.isArray(items) && items.length) {
      await prisma.teacherAvailability.createMany({
        data: items.map(x => ({
          teacherProfileId: teacher.id,
          weekday: Number(x.weekday),
          startMin: Number(x.startMin),
          endMin: Number(x.endMin),
          mode: (String(x.mode || "BOTH").toUpperCase()),
          isActive: !!x.isActive
        }))
      });
    }

    // timeZone güncelle
    await prisma.teacherProfile.update({
      where: { id: teacher.id },
      data: { timeZone: timeZone || teacher.timeZone || "Europe/Istanbul" }
    });

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: "Uygunluk kaydedilemedi." });
  }
}



// --- TimeOff CRUD ---
export const listMyTimeOff = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const items = await prisma.teacherTimeOff.findMany({
      where: { teacherProfileId: teacher.id },
      orderBy: { startsAt: "asc" }
    });
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: "Liste alınamadı." });
  }
};


export const createMyTimeOff = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { startsAt, endsAt, reason } = req.body; // ISO tarih
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const s = new Date(startsAt), e = new Date(endsAt);
    if (!(s instanceof Date) || !(e instanceof Date) || isNaN(s) || isNaN(e) || !isBefore(s, e)) {
      return res.status(400).json({ success: false, message: "Geçersiz tarih aralığı." });
    }

    const item = await prisma.teacherTimeOff.create({
      data: { teacherProfileId: teacher.id, startsAt: s, endsAt: e, reason: reason || null }
    });
    res.json({ success: true, item });
  } catch {
    res.status(400).json({ success: false, message: "Kaydedilemedi." });
  }
};


export const deleteMyTimeOff = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    await prisma.teacherTimeOff.delete({ where: { id } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ success: false, message: "Silinemedi." });
  }
};

// --- Slot üretimi (öğretmenin gözünden, takvim önizleme) ---
export const getMySlots = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ success:false, message:"Yetkisiz" });

    const { from, to, tz, mode = "BOTH", duration = 60 } = req.query;

    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        availabilities: { where: { isActive: true } },
        timeOffs: true,
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: { startsAt: true, endsAt: true },
        },
      },
    });
    if (!teacher) return res.status(404).json({ success:false, message:"Profil bulunamadı." });

    const timeZone = tz || teacher.timeZone || "Europe/Istanbul";
    const start = DateTime.fromISO(String(from), { zone: timeZone }).startOf("day");
    const end   = DateTime.fromISO(String(to),   { zone: timeZone }).endOf("day");
    if (!start.isValid || !end.isValid || start >= end) {
      return res.status(400).json({ success:false, message:"Geçersiz tarih aralığı." });
    }

    const wantedMode = String(mode || "BOTH").toUpperCase();
    const dur = Number(duration) || 60;

    // blokajlar ve bekleyen/onaylı randevular (çakışma için)
    const offIntervals = teacher.timeOffs.map(off => ({
      start: DateTime.fromJSDate(off.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(off.endsAt,   { zone: "utc" }),
    }));
    const apptIntervals = teacher.appointments.map(ap => ({
      start: DateTime.fromJSDate(ap.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(ap.endsAt,   { zone: "utc" }),
    }));

    // ✅ Onaylı randevuları AYRI çekiyoruz ve öğrenci bilgisiyle döndürüyoruz
    const confirmedAppts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: teacher.id,
        status: "CONFIRMED",
        startsAt: {
          gte: start.toUTC().toJSDate(),
        },
        endsAt: {
          lte: end.toUTC().toJSDate(),
        },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    const slots = [];

    // gün gün slot üret
    for (let day = start; day <= end; day = day.plus({ days: 1 }).startOf("day")) {
      const schemaWeekday = day.weekday % 7; // 0..6 (Pazar..Cumartesi)

      const windows = teacher.availabilities.filter(a =>
        a.weekday === schemaWeekday &&
        (a.mode === "BOTH" || a.mode === wantedMode || wantedMode === "BOTH")
      );

      for (const w of windows) {
        const ws = day.startOf("day").plus({ minutes: w.startMin });
        const we = day.startOf("day").plus({ minutes: w.endMin });

        for (let t = ws; t.plus({ minutes: dur }) <= we; t = t.plus({ minutes: dur })) {
          const tEnd = t.plus({ minutes: dur });
          const startUTC = t.toUTC();
          const endUTC   = tEnd.toUTC();

          const blockedByOff  = offIntervals.some(off => overlaps(startUTC, endUTC, off.start, off.end));
          if (blockedByOff) continue;

          const blockedByAppt = apptIntervals.some(ap => overlaps(startUTC, endUTC, ap.start, ap.end));
          if (blockedByAppt) continue;

          slots.push({
            start: startUTC.toISO(),
            end:   endUTC.toISO(),
            mode:  wantedMode === "BOTH" ? w.mode : wantedMode
          });
        }
      }
    }

    // ✅ confirmed array’ini öğrenci bilgisiyle birlikte dönüyoruz
    const confirmed = confirmedAppts.map(a => ({
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      endsAt:   a.endsAt.toISOString(),
      mode:     a.mode,
      student:  a.student ? { id: a.student.id, name: a.student.name, email: a.student.email } : null,
    }));

    return res.json({ success:true, timeZone, slots, confirmed });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success:false, message:"Slotlar oluşturulamadı." });
  }
};

// --- 2.5 Öğretmen randevuları (liste/ekle/güncelle - öğretmen paneli için) ---
export const listMyAppointments = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const items = await prisma.appointment.findMany({
      where: { teacherProfileId: teacher.id },
      orderBy: { startsAt: "asc" }
    });
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: "Randevular alınamadı." });
  }
};

export const createMyAppointment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const { startsAt, endsAt, mode = "ONLINE", price, title, notes } = req.body;
    const s = new Date(startsAt), e = new Date(endsAt);
    if (isNaN(s) || isNaN(e) || !isBefore(s, e)) {
      return res.status(400).json({ success: false, message: "Geçersiz tarih." });
    }

    // Çakışma önle
    const conflict = await prisma.appointment.findFirst({
      where: {
        teacherProfileId: teacher.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [
          { startsAt: { lt: e }, endsAt: { gt: s } }
        ]
      }
    });
    if (conflict) return res.status(409).json({ success: false, message: "Zaman dilimi dolu." });

    const created = await prisma.appointment.create({
      data: {
        teacherProfileId: teacher.id,
        startsAt: s,
        endsAt: e,
        mode: String(mode || "ONLINE").toUpperCase(),
        status: "CONFIRMED", // öğretmen kendi oluşturursa direkt onay
        price: price ?? null,
        title: title || null,
        notes: notes || null
      }
    });

    res.json({ success: true, item: created });
  } catch {
    res.status(400).json({ success: false, message: "Randevu eklenemedi." });
  }
};

export const updateMyAppointment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { status, notes, title } = req.body;

    const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const appt = await prisma.appointment.findUnique({ where: { id } });
    if (!appt || appt.teacherProfileId !== teacher.id) {
      return res.status(404).json({ success: false, message: "Randevu bulunamadı." });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: status || appt.status,
        notes: notes ?? appt.notes,
        title: title ?? appt.title
      }
    });
    res.json({ success: true, item: updated });
  } catch {
    res.status(400).json({ success: false, message: "Randevu güncellenemedi." });
  }
};


export const changeMyPassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Yeni şifre ve doğrulama zorunludur." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Şifreler uyuşmuyor." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Yeni şifre en az 8 karakter olmalı." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, password: true },
    });
    if (!user || user.role !== "teacher") {
      return res.status(403).json({ success: false, message: "Yetkisiz işlem." });
    }

    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Mevcut şifre gerekli." });
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) {
        return res.status(400).json({ success: false, message: "Mevcut şifre yanlış." });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    await prisma.rememberToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });

    return res.json({ success: true, message: "Şifre başarıyla güncellendi." });
  } catch (e) {
    console.error("changeMyPassword error:", e);
    return res.status(500).json({ success: false, message: "Şifre güncellenemedi." });
  }
};


// === LESSONS ===

// List + arama + sayfalama
export const listMyLessons = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!teacher) return res.status(404).json({ success: false, message: "Profil bulunamadı." });

    const q = String(req.query.q || "").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, Math.min(50, parseInt(req.query.pageSize || "10", 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      teacherProfileId: teacher.id,
      isActive: true,
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { topic:   { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.teacherLesson.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.teacherLesson.count({ where }),
    ]);

    res.json({
      success: true,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  } catch (e) {
    console.error("listMyLessons error:", e);
    res.status(500).json({ success: false, message: "Dersler getirilemedi." });
  }
};

// Create
export const createMyLesson = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, mode: true },
    });
    if (!teacher) return res.status(404).json({ success: false, message: "Profil bulunamadı." });

    let { subject, topic, durationMin, priceOnline, priceF2F } = req.body || {};

    subject = String(subject || "").trim();
    topic   = topic != null ? String(topic).trim() : null;

    if (!subject) return res.status(400).json({ success: false, message: "Ders alanı boş olamaz." });

    durationMin = Number(durationMin) || 60;
    if (durationMin <= 0) durationMin = 60;

    const toIntOrNull = (v) => (v === "" || v === undefined ? null : Math.max(0, Math.round(Number(v))));
    const po = toIntOrNull(priceOnline);
    const pf = toIntOrNull(priceF2F);

    const created = await prisma.teacherLesson.create({
      data: {
        teacherProfileId: teacher.id,
        subject,
        topic: topic || null,
        durationMin,
        priceOnline: po,
        priceF2F: pf,
      },
    });

    res.status(201).json({ success: true, item: created });
  } catch (e) {
    console.error("createMyLesson error:", e);
    res.status(500).json({ success: false, message: "Ders eklenemedi." });
  }
};

// Update
export const updateMyLesson = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // sahiplik kontrolü
    const lesson = await prisma.teacherLesson.findUnique({
      where: { id },
      select: { id: true, teacherProfileId: true, teacher: { select: { userId: true } } },
    });
    if (!lesson || lesson.teacher.userId !== userId) {
      return res.status(404).json({ success: false, message: "Ders bulunamadı." });
    }

    let { subject, topic, durationMin, priceOnline, priceF2F, isActive } = req.body || {};
    const data = {};

    if (subject !== undefined) {
      subject = String(subject || "").trim();
      if (!subject) return res.status(400).json({ success: false, message: "Ders alanı boş olamaz." });
      data.subject = subject;
    }
    if (topic !== undefined) data.topic = topic ? String(topic).trim() : null;
    if (durationMin !== undefined) {
      const d = Number(durationMin);
      if (!Number.isFinite(d) || d <= 0) return res.status(400).json({ success: false, message: "Geçersiz süre." });
      data.durationMin = Math.round(d);
    }

    const toIntOrNull = (v) => (v === "" || v === undefined ? null : Math.max(0, Math.round(Number(v))));
    if (priceOnline !== undefined) data.priceOnline = toIntOrNull(priceOnline);
    if (priceF2F   !== undefined) data.priceF2F    = toIntOrNull(priceF2F);
    if (isActive   !== undefined) data.isActive    = Boolean(isActive);

    const updated = await prisma.teacherLesson.update({ where: { id }, data });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("updateMyLesson error:", e);
    res.status(500).json({ success: false, message: "Ders güncellenemedi." });
  }
};

// Delete (soft değil; istersen soft-delete'e çevirebiliriz)
export const deleteMyLesson = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const lesson = await prisma.teacherLesson.findUnique({
      where: { id },
      select: { id: true, teacher: { select: { userId: true } } },
    });
    if (!lesson || lesson.teacher.userId !== userId) {
      return res.status(404).json({ success: false, message: "Ders bulunamadı." });
    }

    await prisma.teacherLesson.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    console.error("deleteMyLesson error:", e);
    res.status(500).json({ success: false, message: "Ders silinemedi." });
  }
};



export const getTeacherSlotsPublic = async (req, res) => {
  try {
    const { slug } = req.params;
    const { from, to, mode = "BOTH", durationMin = 60, tz } = req.query;


    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug },
      include: {
        availabilities: { where: { isActive: true } },
        timeOffs: true,
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            mode: true,
            notes: true,
            student: { select: { id: true, name: true, email: true } }, // opsiyonel: öğrenci bilgisi
          },
        },
      },
    });

    if (
      !teacher ||
      !teacher.isPublic ||
      (teacher.publishStatus && teacher.publishStatus !== "APPROVED")
    ) {
      return res.status(404).json({ message: "Öğretmen bulunamadı." });
    }

    const timeZone = tz || teacher.timeZone || "Europe/Istanbul";
    const start = DateTime.fromISO(String(from), { zone: timeZone }).startOf("day");
    const end   = DateTime.fromISO(String(to),   { zone: timeZone }).endOf("day");

    if (!start.isValid || !end.isValid || start >= end) {
      return res.status(400).json({ message: "Geçersiz tarih aralığı." });
    }

    const wantedMode = String(mode || "BOTH").toUpperCase();
    const dur = Number(durationMin) || 60;

    // Blokajlar
    const offIntervals = teacher.timeOffs.map(off => ({
      start: DateTime.fromJSDate(off.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(off.endsAt,   { zone: "utc" }),
    }));

    // Randevular
    const appts = teacher.appointments.map(ap => ({
      id: ap.id,
      start: DateTime.fromJSDate(ap.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(ap.endsAt,   { zone: "utc" }),
      status: ap.status,  // PENDING / CONFIRMED
      mode: ap.mode,
      notes: ap.notes,
      student: ap.student,
    }));

    const busyPending = appts
      .filter(a => a.status === "PENDING")
      .map(a => ({
        id: a.id,
        start: a.start.toISO(),
        end: a.end.toISO(),
        mode: a.mode,
        notes: a.notes,
        student: a.student,
      }));

    const busyConfirmed = appts
      .filter(a => a.status === "CONFIRMED")
      .map(a => ({
        id: a.id,
        start: a.start.toISO(),
        end: a.end.toISO(),
        mode: a.mode,
        notes: a.notes,
        student: a.student,
      }));

    // Müsait slotlar
    const slots = [];

    for (let day = start; day <= end; day = day.plus({ days: 1 }).startOf("day")) {
      const schemaWeekday = day.weekday % 7; // 0=Sunday..6=Saturday

      const windows = teacher.availabilities.filter(a =>
        a.weekday === schemaWeekday &&
        (a.mode === "BOTH" || a.mode === wantedMode || wantedMode === "BOTH")
      );

      for (const w of windows) {
        const ws = day.startOf("day").plus({ minutes: w.startMin });
        const we = day.startOf("day").plus({ minutes: w.endMin });

        for (let t = ws; t.plus({ minutes: dur }) <= we; t = t.plus({ minutes: dur })) {
          const tEnd = t.plus({ minutes: dur });
          const startUTC = t.toUTC();
          const endUTC   = tEnd.toUTC();

          const blockedByOff  = offIntervals.some(off => overlaps(startUTC, endUTC, off.start, off.end));
          if (blockedByOff) continue;

          const blockedByAppt = appts.some(ap => overlaps(startUTC, endUTC, ap.start, ap.end));
          if (blockedByAppt) continue;

          slots.push({
            start: startUTC.toISO(),
            end:   endUTC.toISO(),
            mode:  wantedMode === "BOTH" ? w.mode : wantedMode,
          });
        }
      }
    }

    return res.json({
      success: true,
      timeZone,
      slots, // müsait
      busy: {
        pending: busyPending,
        confirmed: busyConfirmed,
      },
    });
  } catch (e) {
    console.error("getTeacherSlotsPublic error:", e);
    return res.status(500).json({ message: "Slotlar oluşturulamadı." });
  }
};



export const getMyIncomingRequests = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    // Öğretmen profili
    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // 🔑 CANCELLED dahil
    const requests = await prisma.studentLessonRequest.findMany({
      where: {
        teacherProfileId: tp.id,
        status: { in: ["SUBMITTED", "PACKAGE_SELECTED", "PAID", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        subject: true,
        grade: true,
        mode: true,
        packageSlug: true,
        packageTitle: true,
        packageUnitPrice: true,
        orderId: true,            
        studentId: true,
        student: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    // son 90 gün randevular
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const pendingAppts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: tp.id,
        status: "PENDING",
        startsAt: { gte: since },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        notes: true,
        price: true,
      },
      orderBy: { startsAt: "asc" },
    });

    const confirmedAppts = await prisma.appointment.findMany({
      where: {
        teacherProfileId: tp.id,
        status: "CONFIRMED",
        startsAt: { gte: since },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        notes: true,
        price: true,
        studentUserId: true,
        student: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    // notes içinden requestId=... yakala
    const getReqIdFromNotes = (notes = "") => {
      const m = /requestId=([a-z0-9]+)/i.exec(String(notes) || "");
      return m?.[1] || null;
    };

    const mapByReq = new Map();
    for (const r of requests) {
      const lessonsCount =
        r.packageSlug === "paket-6" ? 6 :
        r.packageSlug === "paket-3" ? 3 : 1;

      // ✅ Sadece ÜCRETSİZ HAK talepleri (free-right):
      // paketli olmalı + birim fiyat 0 olmalı + herhangi bir orderId'ye BAĞLI OLMAMALI
      const isFreeRight =
        Boolean(r.packageSlug) &&
        Number(r.packageUnitPrice) === 0 &&
        !r.orderId;

      // (genel bilgi için paket bayrağı)
      const isPackage =
        Boolean(r.packageSlug) || lessonsCount > 1 || Number(r.packageUnitPrice) === 0;

      mapByReq.set(r.id, {
        ...r,
        lessonsCount,
        isFreeRight,                   // ✅ FE Paket Öğrencileri sekmesi sadece bunu kullanacak
        isPackage,
        paidTL: typeof r.packageUnitPrice === "number" ? r.packageUnitPrice / 100 : null,
        appointments: [],
        appointmentsConfirmed: [],
      });
    }

    for (const a of pendingAppts) {
      const rid = getReqIdFromNotes(a.notes);
      if (rid && mapByReq.has(rid)) mapByReq.get(rid).appointments.push(a);
    }
    for (const a of confirmedAppts) {
      const rid = getReqIdFromNotes(a.notes);
      if (rid && mapByReq.has(rid)) mapByReq.get(rid).appointmentsConfirmed.push(a);
    }

    return res.json({ success: true, items: Array.from(mapByReq.values()) });
  } catch (e) {
    console.error("getMyIncomingRequests error:", e);
    return res.status(500).json({ message: "Talepler getirilemedi." });
  }
};


/**
 * Randevu durum güncelleme: CONFIRMED / CANCELLED
 * Sadece ilgili öğretmen kendi randevusunu güncelleyebilir.
 */
export const updateAppointmentStatus = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const { id } = req.params;      // appointment id
    const { status } = req.body;
    const next = String(status || "").toUpperCase();

    if (!["CONFIRMED", "CANCELLED"].includes(next)) {
      return res.status(400).json({ message: "Geçersiz durum." });
    }

    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // Randevu gerçekten bu öğretmene mi ait?
    const appt = await prisma.appointment.findUnique({
      where: { id },
      // ⬇️ öğrenci ve mod bilgisi mail için gerekiyor
      select: { id: true, teacherProfileId: true, startsAt: true, endsAt: true, studentUserId: true, mode: true, notes: true },
    });
    if (!appt || appt.teacherProfileId !== tp.id) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    // 1) Randevu durumunu güncelle
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: next },
    });

    // 2) Takvime işle (TimeOff) — CONFIRMED -> Ekle, CANCELLED -> Kaldır
    const reasonTag = `APPT#${id}`;
    if (next === "CONFIRMED") {
      // timeoff ekle (varsa atla)
      await prisma.teacherTimeOff.upsert({
        where: {}, update: {}, create: {
          teacherProfileId: tp.id,
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          reason: reasonTag,
        },
      }).catch(async () => {
        const existing = await prisma.teacherTimeOff.findFirst({
          where: { teacherProfileId: tp.id, reason: reasonTag },
        });
        if (!existing) {
          await prisma.teacherTimeOff.create({
            data: {
              teacherProfileId: tp.id,
              startsAt: appt.startsAt,
              endsAt: appt.endsAt,
              reason: reasonTag,
            },
          });
        }
      });

      // 3) ✅ Öğrenciye e-posta gönder
      try {
        if (appt.studentUserId) {
          const [student, teacherInfo] = await Promise.all([
            prisma.user.findUnique({ where: { id: appt.studentUserId }, select: { email: true, name: true } }),
            prisma.teacherProfile.findUnique({ where: { id: tp.id }, select: { firstName: true, lastName: true } }),
          ]);

          const studentEmail = student?.email;
          const teacherName = `${teacherInfo?.firstName || ""} ${teacherInfo?.lastName || ""}`.trim();

          if (studentEmail) {
            await sendAppointmentConfirmedToStudent(studentEmail, {
              studentName: student?.name || "",
              teacherName,
              // ders/grade bilgisini bulmak için gerekirse appointment.notes içindeki requestId ile request’e bakabilirsiniz.
              // Basit versiyon: yalnızca mod + zaman bilgisi
              subject: "", // opsiyonel
              grade: "",   // opsiyonel
              modeLabel: appt.mode === "FACE_TO_FACE" ? "Yüz yüze" : "Online",
              startsAt: appt.startsAt,
              endsAt: appt.endsAt,
            });
          }
        }
      } catch (mailErr) {
        console.error("Onay maili gönderilemedi:", mailErr?.message || mailErr);
        // mail hatası akışı bozmasın
      }
    } else if (next === "CANCELLED") {
      await prisma.teacherTimeOff.deleteMany({
        where: { teacherProfileId: tp.id, reason: reasonTag },
      });
       const reqId = parseRequestId(appt.notes);
 try {
   await prisma.$transaction(async (tx) => {
     await refundFreeRightByRequestId(tx, reqId, 1);
   });
 } catch (e) {
   console.warn("Free-right refund skipped:", e?.message || e);
 }


    }

    return res.json({ success: true, appointment: updated });
  } catch (e) {
    console.error("updateAppointmentStatus error:", e);
    return res.status(500).json({ message: "Durum güncellenemedi." });
  }
};




// GET /api/v1/ogretmen/me/appointments/confirmed
export const getMyConfirmedAppointments = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    // Öğretmenin profilini bul
    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // (Opsiyonel) son 90 gün filtre
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // CONFIRMED randevuları öğrenci bilgisiyle getir
    const items = await prisma.appointment.findMany({
      where: {
        teacherProfileId: tp.id,
        status: "CONFIRMED",
        startsAt: { gte: since },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        notes: true,
        // 🔴 Önemli kısım: öğrenciyi da seçiyoruz
        student: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    return res.json({ success: true, items });
  } catch (e) {
    console.error("getMyConfirmedAppointments error:", e);
    return res.status(500).json({ message: "Onaylı randevular getirilemedi." });
  }
};



/** Öğretmenin işaretlediği geçmiş dersler */
export const getMyPastAppointmentsTeacher = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    const items = await prisma.appointment.findMany({
      where: {
        teacherProfileId: tp.id,
        // Öğretmenin tamamladığı dersler
        notes: { contains: "doneTeacherAt=" },
      },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        notes: true,
        studentUserId: true,
        student: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    res.json({ success: true, items });
  } catch (e) {
    console.error("getMyPastAppointmentsTeacher error:", e);
    res.status(500).json({ message: "Geçmiş dersler getirilemedi." });
  }
};

/** Öğretmen: Ders tamamlandı işareti */
export const completeAppointmentByTeacher = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const { id } = req.params; // appointment id

    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, teacherProfileId: true, endsAt: true, notes: true },
    });
    if (!appt || appt.teacherProfileId !== tp.id) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    // Sadece ders saati geçtikten sonra izin ver
    if (new Date(appt.endsAt) > new Date()) {
      return res.status(400).json({ message: "Ders saati bitmeden tamamlanamaz." });
    }

    const notes = String(appt.notes || "");
    if (notes.includes("doneTeacherAt=")) {
      return res.json({ success: true, already: true });
    }

    const stamp = `doneTeacherAt=${new Date().toISOString()}`;
    const updated = await prisma.appointment.update({
      where: { id },
      data: { notes: notes ? `${notes};${stamp}` : stamp },
      select: { id: true, notes: true },
    });

    res.json({ success: true, appointment: updated });
  } catch (e) {
    console.error("completeAppointmentByTeacher error:", e);
    res.status(500).json({ message: "Tamamlandı işareti verilemedi." });
  }
};



// Öğretmen: profilini yayına almak için talep yollar
export const requestPublish = async (req, res) => {
  try {
    const userId = req.user?.id;
    const profile = await prisma.teacherProfile.findFirst({ where: { userId } });
    if (!profile) return res.status(404).json({ message: "Profil bulunamadı." });

    if (profile.publishStatus === "PENDING") {
      return res.status(400).json({ message: "Zaten onay bekliyor." });
    }

    const updated = await prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        publishStatus: "PENDING",
        isPublic: false,
        submittedAt: new Date(),
        reviewNote: null,
      },
    });

    return res.json({ message: "Yayın talebiniz admin onayına gönderildi.", profile: updated });
  } catch (e) {
    console.error("requestPublish error:", e);
    return res.status(500).json({ message: "Talep gönderilemedi." });
  }
};


// --- PROFİLİ YAYINDAN KALDIR ---
export const unpublishMyProfile = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(404).json({ message: "Öğretmen profili bulunamadı." });

    const profile = await prisma.teacherProfile.update({
      where: { id: tp.id },
      data: {
        isPublic: false,
        publishStatus: "DRAFT",
        reviewedAt: null,
        reviewerId: null,
        reviewNote: null,
      },
      select: {
        id: true,
        isPublic: true,
        publishStatus: true,
        reviewedAt: true,
        reviewNote: true,
        slug: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
      },
    });

    return res.json({
      success: true,
      message: "Profil yayından kaldırıldı.",
      profile,
    });
  } catch (e) {
    console.error("unpublishMyProfile error:", e);
    return res.status(500).json({ message: "Profil yayından kaldırılamadı." });
  }
};

// --- TALEBI REDDET ---

export const cancelRequest = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const requestId = String(req.params.id || "");
    if (!requestId) return res.status(400).json({ message: "requestId gerekli" });

    // 1) Öğretmen profilini bul
    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // 2) Talebi doğrula (gerçekten bu öğretmene mi ait?) + paket/ücretsiz mi?
    const request = await prisma.studentLessonRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        teacherProfileId: true,
        studentId: true,
        status: true,
        packageSlug: true,
        packageUnitPrice: true,
      },
    });
    if (!request || request.teacherProfileId !== tp.id) {
      return res.status(404).json({ message: "Talep bulunamadı." });
    }

    const isFree = !!request.packageSlug || Number(request.packageUnitPrice) === 0;

    // 3) Tek transaction: randevuları iptal et + talebi CANCELLED yaz + (gerekirse) hak iadesi
    const result = await prisma.$transaction(async (tx) => {
      // 3.a) Bu talebe ait randevuları (notlarda requestId ile) CANCELLED yap
      const apptRes = await tx.appointment.updateMany({
        where: {
          teacherProfileId: tp.id,
          status: { not: "CANCELLED" },
          notes: { contains: `requestId=${requestId}` },
        },
        data: { status: "CANCELLED" },
      });
      const cancelledCount = apptRes.count || 0;

      // 3.b) Talep durumunu CANCELLED yap
      let reqRes = null;
      try {
        reqRes = await tx.studentLessonRequest.update({
          where: { id: requestId },
          data: { status: "CANCELLED" },
        });
      } catch {
        // talep bulunamazsa veya zaten CANCELLED ise sessiz geç
      }

      // 3.c) Ücretsiz hak iadesi (paket/ücretsiz talep ise)
      if (isFree && cancelledCount > 0) {
        // İlgili (veya en güncel) aktif hak kaydını bul
        const right = await tx.studentPackageRight.findFirst({
          where: {
            studentId: request.studentId,
            isActive: true,
            ...(request.packageSlug ? { packageSlug: request.packageSlug } : {}),
          },
          orderBy: { updatedAt: "desc" },
        });

        if (right) {
          const refundCount = Math.min(cancelledCount, Math.max(0, right.rightsUsed)); // negatifi engelle
          if (refundCount > 0) {
            await tx.studentPackageRight.update({
              where: { id: right.id },
              data: { rightsUsed: { decrement: refundCount } },
            });
          }
        }
      }

      return { apptCancelled: cancelledCount, request: reqRes };
    });

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("cancelRequest error:", e);
    return res.status(500).json({ message: "Talep reddedilemedi." });
  }
};
