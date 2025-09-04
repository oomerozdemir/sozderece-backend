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
        emailVerified: false,
        isVerified: false
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
        photoUrl,
        slug,
        isPublic: true
      }
    });

    // --- E-posta doğrulama kodu gönder ---
    let emailSent = false;
    try {
      await createVerificationCode({
        userId: user.id,
        type: "email",
        target: user.email
      });
      emailSent = true;
    } catch (e) {
      // doğrulama kodu gönderilemese de kayıt tamamdır; logla ve devam et
      console.error("send verification code error:", e);
    }

    // --- JWT ---
    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Öğretmen kaydı tamamlandı. E-posta doğrulama kodu gönderildi."
        : "Öğretmen kaydı tamamlandı. (Uyarı: Doğrulama e-postası gönderilemedi)",
      token,
      user,
      profile,
      verification: { emailSent }
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
      isPublic
    } = req.body || {};

    // --- Normalizasyon / Validasyon ---

    // İsimler
    if (typeof firstName === "string") firstName = firstName.trim();
    if (typeof lastName === "string")  lastName  = lastName.trim();

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
    const { from, to, mode = "BOTH", duration = 60, tz } = req.query;

    const teacher = await prisma.teacherProfile.findUnique({
      where: { slug },
      include: {
        availabilities: { where: { isActive: true } },
        timeOffs: true,
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: { startsAt: true, endsAt: true }
        }
      }
    });
    if (!teacher || !teacher.isPublic || !teacher.isApproved) {
      return res.status(404).json({ message: "Öğretmen bulunamadı." });
    }

    const timeZone = tz || teacher.timeZone || "Europe/Istanbul";
    const start = DateTime.fromISO(String(from), { zone: timeZone }).startOf("day");
    const end   = DateTime.fromISO(String(to),   { zone: timeZone }).endOf("day");
    if (!start.isValid || !end.isValid || start >= end) {
      return res.status(400).json({ message: "Geçersiz tarih aralığı." });
    }

    const wantedMode = String(mode || "BOTH").toUpperCase();
    const dur = Number(duration) || 60;

    const offIntervals = teacher.timeOffs.map(off => ({
      start: DateTime.fromJSDate(off.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(off.endsAt,   { zone: "utc" }),
    }));
    const apptIntervals = teacher.appointments.map(ap => ({
      start: DateTime.fromJSDate(ap.startsAt, { zone: "utc" }),
      end:   DateTime.fromJSDate(ap.endsAt,   { zone: "utc" }),
    }));

    const slots = [];

    for (let day = start; day <= end; day = day.plus({ days: 1 }).startOf("day")) {
      const schemaWeekday = day.weekday % 7; // 0..6

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

    return res.json({ success: true, slots, timeZone });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Slotlar oluşturulamadı." });
  }
};


export const getMyIncomingRequests = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ message: "Yetkisiz" });

    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // İlgili talepler
    const requests = await prisma.studentLessonRequest.findMany({
      where: {
        teacherProfileId: tp.id,
        status: { in: ["SUBMITTED", "PACKAGE_SELECTED", "PAID"] },
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
        studentId: true,
        student: { select: { id: true, name: true, email: true } },
      },
    });

    // O öğretmene ait tüm PENDING randevular (son 90 günde)
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
        price: true,
        notes: true, // requestId=...
      },
      orderBy: { startsAt: "asc" },
    });

    // requestId=... ile eşle
    const mapByReq = new Map();
    for (const r of requests) mapByReq.set(r.id, { ...r, appointments: [] });
    for (const a of pendingAppts) {
      const m = /requestId=([a-z0-9]+)/i.exec(a.notes || "");
      const rid = m?.[1];
      if (rid && mapByReq.has(rid)) {
        mapByReq.get(rid).appointments.push(a);
      }
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

    const { id } = req.params; // appointment id
    const { status } = req.body;
    const next = String(status || "").toUpperCase();

    if (!["CONFIRMED", "CANCELLED"].includes(next)) {
      return res.status(400).json({ message: "Geçersiz durum." });
    }

    // Öğretmen profili
    const tp = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) return res.status(403).json({ message: "Öğretmen profili bulunamadı." });

    // İlgili randevu gerçekten bu öğretmeninkiyse
    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, teacherProfileId: true },
    });
    if (!appt || appt.teacherProfileId !== tp.id) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: next },
    });

    return res.json({ success: true, appointment: updated });
  } catch (e) {
    console.error("updateAppointmentStatus error:", e);
    return res.status(500).json({ message: "Durum güncellenemedi." });
  }
};