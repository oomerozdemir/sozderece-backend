import prisma from "../utils/prisma.js";
import { sendEmail } from "../utils/sendEmail.js";

/**
 * POST /api/v1/applications/apply
 * Öğretmen başvurusu oluşturma
 */
export const createInstructorApplication = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      birthDate,
      category,
      university,
      department,
      ranking,
      message,
    } = req.body;

    // === Validation ===
    if (!firstName || !lastName || !email || !phone || !category) {
      return res.status(400).json({
        success: false,
        message: "Ad, soyad, e-posta, telefon ve kategori alanları zorunludur.",
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Geçerli bir e-posta adresi giriniz.",
      });
    }

    // Phone validation (Turkish format)
    const phoneRegex = /^(05)([0-9]{9})$/;
    const cleanPhone = phone.replace(/\s/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Telefon numarası 05XX XXX XX XX formatında olmalıdır.",
      });
    }

    // Category validation
    const validCategories = ["PDR_GRADUATE", "PDR_STUDENT", "UNIVERSITY_STUDENT"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz kategori seçimi.",
      });
    }

    // Conditional validation for university students
    if (category === "UNIVERSITY_STUDENT") {
      if (!university || !department) {
        return res.status(400).json({
          success: false,
          message: "Üniversite öğrencileri için üniversite ve bölüm bilgisi zorunludur.",
        });
      }
    }

    // === File Upload Handling ===
    let cvUrl = null;
    if (req.file) {
      // Cloudinary URL (CloudinaryStorage middleware already uploaded it)
      cvUrl = req.file.secure_url || req.file.path;
    }

    // === Parse birthDate ===
    let parsedBirthDate = null;
    if (birthDate) {
      parsedBirthDate = new Date(birthDate);
      if (isNaN(parsedBirthDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Geçersiz doğum tarihi formatı.",
        });
      }
    }

    // === Create Application in Database ===
    const application = await prisma.instructorApplication.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        birthDate: parsedBirthDate,
        category,
        university: university?.trim() || null,
        department: department?.trim() || null,
        ranking: ranking?.trim() || null,
        message: message?.trim() || null,
        cvUrl,
        status: "PENDING",
      },
    });

    // === Send Email Notification ===
    try {
      const categoryLabels = {
        PDR_GRADUATE: "PDR Mezunu",
        PDR_STUDENT: "PDR Öğrencisi",
        UNIVERSITY_STUDENT: "Üniversite Öğrencisi",
      };

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
          <table width="100%" style="max-width: 650px; margin: auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <tr>
              <td style="background: linear-gradient(135deg, #100481 0%, #FF6B35 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🎓 Yeni Öğretmen Başvurusu</h1>
              </td>
            </tr>
            
            <tr>
              <td style="padding: 30px;">
                <div style="background: #f0f9ff; border-left: 4px solid #100481; padding: 16px; margin-bottom: 24px;">
                  <h2 style="margin: 0 0 8px; color: #100481; font-size: 18px;">Başvuru Bilgileri</h2>
                  <p style="margin: 0; color: #64748b; font-size: 14px;">Başvuru No: <strong>#${application.id.slice(-8)}</strong></p>
                  <p style="margin: 4px 0 0; color: #64748b; font-size: 14px;">Tarih: <strong>${new Date().toLocaleDateString("tr-TR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</strong></p>
                </div>

                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569; width: 35%;">Ad Soyad:</td>
                    <td style="padding: 12px 8px; color: #1e293b;">${firstName} ${lastName}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">E-posta:</td>
                    <td style="padding: 12px 8px; color: #1e293b;"><a href="mailto:${email}" style="color: #100481; text-decoration: none;">${email}</a></td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">Telefon:</td>
                    <td style="padding: 12px 8px; color: #1e293b;"><a href="tel:${cleanPhone}" style="color: #100481; text-decoration: none;">${cleanPhone}</a></td>
                  </tr>
                  ${
                    parsedBirthDate
                      ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">Doğum Tarihi:</td>
                    <td style="padding: 12px 8px; color: #1e293b;">${parsedBirthDate.toLocaleDateString("tr-TR")}</td>
                  </tr>
                  `
                      : ""
                  }
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">Kategori:</td>
                    <td style="padding: 12px 8px;">
                      <span style="background: #FF6B35; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                        ${categoryLabels[category]}
                      </span>
                    </td>
                  </tr>
                  ${
                    university
                      ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">Üniversite:</td>
                    <td style="padding: 12px 8px; color: #1e293b;">${university}</td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    department
                      ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">Bölüm:</td>
                    <td style="padding: 12px 8px; color: #1e293b;">${department}</td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    ranking
                      ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">YKS Derecesi:</td>
                    <td style="padding: 12px 8px; color: #1e293b;">${ranking}</td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    cvUrl
                      ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 8px; font-weight: 600; color: #475569;">CV:</td>
                    <td style="padding: 12px 8px;">
                      <a href="${cvUrl}" style="background: #100481; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 13px;">
                        📄 CV'yi Görüntüle
                      </a>
                    </td>
                  </tr>
                  `
                      : ""
                  }
                </table>

                ${
                  message
                    ? `
                <div style="margin-top: 24px; background: #fef3c7; border: 1px solid #fde68a; padding: 16px; border-radius: 8px;">
                  <h3 style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">📝 Mesaj:</h3>
                  <p style="margin: 0; color: #78350f; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${message}</p>
                </div>
                `
                    : ""
                }

                <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
                  <a href="https://sozderecekocluk.com/admin/applications" style="background: linear-gradient(135deg, #100481 0%, #FF6B35 100%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                    Admin Panelinde Görüntüle
                  </a>
                </div>
              </td>
            </tr>
            
            <tr>
              <td style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
                <p style="margin: 0;">© ${new Date().getFullYear()} SözDerece Koçluk • Bu mail otomatik olarak gönderilmiştir.</p>
              </td>
            </tr>
          </table>
        </div>
      `;

      await sendEmail({
        to: process.env.ADMIN_EMAIL || "iletisim@sozderecekocluk.com",
        subject: `🎓 Yeni Öğretmen Başvurusu - ${firstName} ${lastName}`,
        html: emailHtml,
      });

      console.log("✅ Başvuru bildirimi e-postası gönderildi.");
    } catch (emailError) {
      console.error("❌ E-posta gönderilemedi:", emailError);
      // Email hatası başvuruyu engellemez
    }

    // === Success Response ===
    return res.status(201).json({
      success: true,
      message: "Başvurunuz başarıyla alındı. En kısa sürede size dönüş yapılacaktır.",
      application: {
        id: application.id,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Başvuru oluşturma hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Başvuru işlenirken bir hata oluştu. Lütfen tekrar deneyiniz.",
    });
  }
};

/**
 * GET /api/v1/applications (Admin only)
 * Tüm başvuruları listeleme
 */
export const getAllApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const where = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [applications, total] = await Promise.all([
      prisma.instructorApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.instructorApplication.count({ where }),
    ]);

    return res.json({
      success: true,
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Başvuru listeleme hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Başvurular getirilemedi.",
    });
  }
};

/**
 * PATCH /api/v1/applications/:id/status (Admin only)
 * Başvuru durumunu güncelleme
 */
export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz durum değeri.",
      });
    }

    const updated = await prisma.instructorApplication.update({
      where: { id },
      data: { status },
    });

    return res.json({
      success: true,
      message: "Başvuru durumu güncellendi.",
      application: updated,
    });
  } catch (error) {
    console.error("❌ Durum güncelleme hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Durum güncellenemedi.",
    });
  }
};