import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import slugify from "slugify";
import { generateToken } from "../middleware/authMiddleware.js";
import { createVerificationCode } from "../services/verificationService.js";
import { DateTime } from "luxon";

import { isBefore } from "date-fns";

const prisma = new PrismaClient();

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
    const {
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
      priceOnline,
      priceF2F,
      bio,
      photoUrl
    } = req.body;

    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: "Zorunlu alanlar eksik." });
    }

    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res.status(400).json({ success: false, message: "Bu e-posta zaten kayıtlı." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        password: hashed,
        role: "teacher",
        phone: phone || null,
        emailVerified: false,
        isVerified: false
      },
      select: { id: true, email: true, role: true, name: true }
    });

    const slug = makeSlug(firstName, lastName);
    const normMode = ["ONLINE", "FACE_TO_FACE", "BOTH"].includes(String(mode || "").toUpperCase())
      ? String(mode).toUpperCase()
      : "BOTH";

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
        priceOnline: priceOnline ?? null,
        priceF2F: priceF2F ?? null,
        bio: bio ?? null,
        photoUrl: photoUrl ?? null,
        slug,
        isPublic: true
      }
    });

    await createVerificationCode({
      userId: user.id,
      type: "email",
      target: user.email
    });

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({
      success: true,
      message: "Öğretmen kaydı tamamlandı. E-posta doğrulama kodu gönderildi.",
      token,
      user,
      profile,
      verification: { emailSent: true }
    });
  } catch (err) {
    console.error("registerTeacher error:", err);
    return res.status(500).json({ success: false, message: "Kayıt başarısız." });
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
      firstName, lastName,
      subjects, grades,
      city, district,
      mode,                 // "ONLINE" | "FACE_TO_FACE" | "BOTH"
      priceOnline, priceF2F,
      bio, photoUrl,
      isPublic
    } = req.body || {};

    // --- Normalizasyon / Validasyon ---

    // İsimler
    if (typeof firstName === "string") firstName = firstName.trim();
    if (typeof lastName === "string")  lastName  = lastName.trim();

    // Dizi alanlar: subjects / grades
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
    if (typeof city === "string")    city    = city.trim();
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

    // Fiyatlar (Int? alanlar)
    const toIntOrNull = (v) => {
      if (v === null) return null;
      if (v === undefined || v === "") return undefined; 
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.round(n);
    };
    let nPriceOnline = toIntOrNull(priceOnline);
    let nPriceF2F    = toIntOrNull(priceF2F);

    // Mod-fiyat uyumu: tek moda geçildiyse diğerini null’la
    // (BOTH ise her ikisi de gönderildiyse güncellenir, gönderilmediyse dokunmayız)
    if (mode === "ONLINE") {
      // sadece online geçerli → F2F'i null’a çek (eğer alan gönderildiyse)
      if (nPriceF2F !== undefined) nPriceF2F = null;
    } else if (mode === "FACE_TO_FACE") {
      if (nPriceOnline !== undefined) nPriceOnline = null;
    }

    // Bio / Photo
    if (typeof bio === "string")      bio = bio.trim();
    if (typeof photoUrl === "string") photoUrl = photoUrl.trim();

    // Yayın durumu
    if (typeof isPublic !== "undefined") {
      isPublic = Boolean(isPublic);
    } else {
      isPublic = undefined; // gönderilmemişse değiştirme
    }

    // --- Güncellenecek veri setini oluştur ---
    const data = {
      ...(firstName !== undefined && { firstName }),
      ...(lastName  !== undefined && { lastName }),
      ...(normSubjects !== undefined && { subjects: normSubjects }),
      ...(normGrades   !== undefined && { grades: normGrades }),
      ...(city     !== undefined && { city }),
      ...(district !== undefined && { district }),
      ...(mode     !== undefined && { mode }),
      ...(nPriceOnline !== undefined && { priceOnline: nPriceOnline }),
      ...(nPriceF2F    !== undefined && { priceF2F: nPriceF2F }),
      ...(bio      !== undefined && { bio }),
      ...(photoUrl !== undefined && { photoUrl }),
      ...(isPublic !== undefined && { isPublic }),
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

    // İsim değiştiyse User.name’i de güncelle (slug'a dokunmuyoruz)
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
      minPrice, maxPrice, sort // <-- NEW
    } = req.query;

    const take = Math.min(Number(limit) || 20, 50);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Fiyat filtresi
    const priceFilter =
      mode === "ONLINE" ? { priceOnline: {} } :
      mode === "FACE_TO_FACE" ? { priceF2F: {} } :
      { OR: [{ priceOnline: {} }, { priceF2F: {} }] };

    if (minPrice) {
      const v = Number(minPrice);
      if (mode === "ONLINE") priceFilter.priceOnline.gte = v;
      else if (mode === "FACE_TO_FACE") priceFilter.priceF2F.gte = v;
      else priceFilter.OR = [{ priceOnline: { gte: v } }, { priceF2F: { gte: v } }];
    }
    if (maxPrice) {
      const v = Number(maxPrice);
      if (mode === "ONLINE") priceFilter.priceOnline.lte = v;
      else if (mode === "FACE_TO_FACE") priceFilter.priceF2F.lte = v;
      else priceFilter.OR = [
        { priceOnline: { ...(priceFilter.OR?.[0]?.priceOnline || {}), lte: v } },
        { priceF2F:    { ...(priceFilter.OR?.[1]?.priceF2F    || {}), lte: v } },
      ];
    }

    const where = {
      isPublic: true,
      isApproved: true,
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

    // Sıralama
    let orderBy = [{ createdAt: "desc" }]; // fallback
    if (sort === "most_viewed") orderBy = [{ viewCount: "desc" }, { ratingAverage: "desc" }, { ratingCount: "desc" }];
    if (sort === "top_rated")   orderBy = [{ ratingAverage: "desc" }, { ratingCount: "desc" }, { viewCount: "desc" }];
    if (sort === "priceOnline_asc")  orderBy = [{ priceOnline: "asc" }, { createdAt: "desc" }];
    if (sort === "priceOnline_desc") orderBy = [{ priceOnline: "desc" }, { createdAt: "desc" }];
    if (sort === "priceF2F_asc")     orderBy = [{ priceF2F: "asc" }, { createdAt: "desc" }];
    if (sort === "priceF2F_desc")    orderBy = [{ priceF2F: "desc" }, { createdAt: "desc" }];

    const [items, total] = await Promise.all([
      prisma.teacherProfile.findMany({
        where, skip, take, orderBy,
        select: {
          id: true, firstName: true, lastName: true, subjects: true, grades: true,
          city: true, district: true, mode: true, priceOnline: true, priceF2F: true,
          photoUrl: true, slug: true, viewCount: true, ratingAverage: true, ratingCount: true
        }
      }),
      prisma.teacherProfile.count({ where })
    ]);

    res.json({ success: true, page: Number(page)||1, total, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Listeleme hatası." });
  }
};


/** Public – tek öğretmen sayfası */
export const getTeacherBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const item = await prisma.teacherProfile.findUnique({
      where: { slug },
      include: { user: { select: { id: true, name: true, emailVerified: true } } }
    });
    if (!item || !item.isPublic) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }
    return res.json({ success: true, teacher: item });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
};


export const trackTeacherView = async (req, res) => {
  try {
    const { slug } = req.params;
    const item = await prisma.teacherProfile.findUnique({ where: { slug } });
    if (!item || !item.isPublic || !item.isApproved) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }
    await prisma.teacherProfile.update({
      where: { id: item.id },
      data: { viewCount: { increment: 1 } }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "View sayacı hatası." });
  }
};

export const addTeacherReview = async (req, res) => {
  try {
    const { slug } = req.params;
    const { rating, comment } = req.body;
    if (!(Number(rating) >= 1 && Number(rating) <= 5)) {
      return res.status(400).json({ success: false, message: "Rating 1..5 olmalı." });
    }

    const item = await prisma.teacherProfile.findUnique({ where: { slug } });
    if (!item || !item.isPublic || !item.isApproved) {
      return res.status(404).json({ success: false, message: "Öğretmen bulunamadı." });
    }

    const userId = req.user?.id; // authenticateToken varsa
    await prisma.teacherReview.create({
      data: {
        teacherProfileId: item.id,
        userId: userId ?? null,
        rating: Number(rating),
        comment: comment ?? null
      }
    });

    // denormalize
    const agg = await prisma.teacherReview.aggregate({
      where: { teacherProfileId: item.id },
      _avg: { rating: true },
      _count: { rating: true }
    });
    await prisma.teacherProfile.update({
      where: { id: item.id },
      data: {
        ratingAverage: agg._avg.rating ?? 0,
        ratingCount: agg._count.rating ?? 0
      }
    });

    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Değerlendirme eklenemedi." });
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
// GET query: from=2025-09-01&to=2025-09-07&tz=Europe/Istanbul&mode=BOTH&duration=60
export const getMySlots = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { from, to, tz, mode = "BOTH", duration = 60 } = req.query;

    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        availabilities: { where: { isActive: true } },
        timeOffs: true,
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: { startsAt: true, endsAt: true }
        }
      }
    });
    if (!teacher) return res.status(404).json({ message: "Profil bulunamadı." });

    const timeZone = tz || teacher.timeZone || "Europe/Istanbul";
    const start = DateTime.fromISO(String(from), { zone: timeZone }).startOf("day");
    const end   = DateTime.fromISO(String(to),   { zone: timeZone }).endOf("day");

    if (!start.isValid || !end.isValid || start >= end) {
      return res.status(400).json({ success: false, message: "Geçersiz tarih aralığı." });
    }

    const wantedMode = String(mode || "BOTH").toUpperCase();
    const dur = Number(duration) || 60;

    // DB'deki blokaj ve randevuları UTC DateTime'a çevir
    const offIntervals = teacher.timeOffs.map(off => ({
      start: DateTime.fromJSDate(off.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(off.endsAt,   { zone: "utc" }),
    }));
    const apptIntervals = teacher.appointments.map(ap => ({
      start: DateTime.fromJSDate(ap.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(ap.endsAt,   { zone: "utc" }),
    }));

    const slots = [];

    // Gün gün ilerle
    for (let day = start; day <= end; day = day.plus({ days: 1 }).startOf("day")) {
      // Luxon: 1=Mon..7=Sun → şemanda 0=Sun..6=Sat
      const schemaWeekday = day.weekday % 7;

      const windows = teacher.availabilities.filter(a =>
        a.weekday === schemaWeekday &&
        (a.mode === "BOTH" || a.mode === wantedMode || wantedMode === "BOTH")
      );

      for (const w of windows) {
        const ws = day.startOf("day").plus({ minutes: w.startMin }); // local TZ
        const we = day.startOf("day").plus({ minutes: w.endMin });   // local TZ

        // duration adımıyla slot üret
        for (let t = ws; t.plus({ minutes: dur }) <= we; t = t.plus({ minutes: dur })) {
          const tEnd = t.plus({ minutes: dur });

          // UTC'ye çevir
          const startUTC = t.toUTC();
          const endUTC   = tEnd.toUTC();

          // ÇAKIŞMA: timeOff veya appointment ile kesişiyor mu?
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

    return res.json({ success: true, slots, timeZone });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Slotlar oluşturulamadı." });
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
