import express from "express";
import { getAllUsers, deleteUser, updateUser, createUserAsAdmin, getAllContacts, deleteContact } from "../../controllers/adminController.js";
import {deleteOrder, getAllOrdersForAdmin, getRefundRequests, approveRefundRequest, 
  rejectRefund, updateOrder, updateBillingInfo, checkPaytrStatus} from "../../controllers/adminOrder.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { PrismaClient } from "@prisma/client";
import upload from "../../middleware/upload.js";
import { sendExpiringOrderReminders } from "../../controllers/reminder.controller.js";
import { createCoachWithUser, getAllCoaches, updateCoach, deleteCoach, assignCoachToUser } from "../../controllers/adminCoach.controller.js";
import { listTeacherPublishRequests, approveTeacherPublish, rejectTeacherPublish, getTeacherRequestSummary } from "../../controllers/AdminTeacher.controller.js";
import { updateCountdown, updatePopup, updatePaymentPageSettings, updateEarlyRegistration, updatePricingVideo } from "../../controllers/siteSettings.controller.js";
import { getAllPackages, createPackage, updatePackage, togglePackageVisibility, deletePackage } from "../../controllers/package.controller.js";
import { getAdminConsultationSlots, toggleConsultationSlot, bulkUpdateConsultationSlots } from "../../controllers/consultationSlot.controller.js";
import { getAllNavbarItems, createNavbarItem, updateNavbarItem, deleteNavbarItem, reorderNavbarItems } from "../../controllers/navbarItem.controller.js";
import { getAllSubscriptionsForAdmin, adminCancelSubscription } from "../../controllers/subscription.controller.js";

const prisma = new PrismaClient();

const router = express.Router();

router.get("/users", authenticateToken, authorizeRoles("admin"), getAllUsers);

// Kullanıcı sil
router.delete("/users/:id", authenticateToken, authorizeRoles("admin"), deleteUser);

// Kullanıcı güncelle
router.put("/users/:id", authenticateToken, authorizeRoles("admin"), updateUser);
router.post("/users", authenticateToken, authorizeRoles("admin"), createUserAsAdmin);

// Ücretsiz görüşme randevusu (Contact) talepleri
router.get("/contacts", authenticateToken, authorizeRoles("admin"), getAllContacts);
router.delete("/contacts/:id", authenticateToken, authorizeRoles("admin"), deleteContact);

// Iade islemleri
router.get("/orders/refund-requests", authenticateToken, authorizeRoles("admin"), getRefundRequests);
router.put("/orders/:id/approve-refund", authenticateToken, authorizeRoles("admin"), approveRefundRequest);
router.put("/orders/:id/reject-refund", authenticateToken, authorizeRoles("admin"), rejectRefund);

// Siparis Islemleri — authorizeRoles eksikti: herhangi bir authenticated kullanıcı tüm siparişleri görebiliyordu
router.get("/orders", authenticateToken, authorizeRoles("admin"), getAllOrdersForAdmin);
router.delete("/orders/:id", authenticateToken, authorizeRoles("admin"), deleteOrder);
router.put("/orders/:id", authenticateToken, authorizeRoles("admin"), updateOrder);
router.put("/orders/:id/billing", authenticateToken, authorizeRoles("admin"), updateBillingInfo);
router.post("/orders/check-payment", authenticateToken, authorizeRoles("admin"), checkPaytrStatus);


//Koc yonetimi
router.get("/coaches", authenticateToken, authorizeRoles("admin"), getAllCoaches);
router.post("/coaches", authenticateToken, authorizeRoles("admin"), upload.single("image"),  createCoachWithUser);

router.put(
  "/coaches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  upload.single("image"),
  updateCoach
);
router.delete("/coaches/:id", authenticateToken, authorizeRoles("admin"), deleteCoach);
router.post("/assign-coach", authenticateToken, authorizeRoles("admin"), assignCoachToUser);


// Süresi yaklaşan siparişler için e-posta hatırlatması gönder
router.post("/orders/send-expiry-reminders", authenticateToken, authorizeRoles("admin"), sendExpiringOrderReminders);

// Abonelik yönetimi
router.get("/subscriptions", authenticateToken, authorizeRoles("admin"), getAllSubscriptionsForAdmin);
router.put("/subscriptions/:id/cancel", authenticateToken, authorizeRoles("admin"), adminCancelSubscription);


//teacher publish requests
router.get(
  "/teacher-publish-requests",
  authenticateToken, authorizeRoles("admin"),
  listTeacherPublishRequests
);
router.put(
  "/teacher-publish-requests/:profileId/approve",
  authenticateToken, authorizeRoles("admin"),
  approveTeacherPublish
);
router.put(
  "/teacher-publish-requests/:profileId/reject",
  authenticateToken, authorizeRoles("admin"),
  rejectTeacherPublish
);


router.get(
  "/lesson-requests/teacher-summary",
  authenticateToken,
  authorizeRoles("admin"),
  getTeacherRequestSummary
);


// CSV olusturma 
router.get("/orders/export", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        billingInfo: true,
        // Order'da doğrudan bir coach ilişkisi yok; atanan koç User.assignedCoach
        // üzerinden geliyor.
        user: { include: { assignedCoach: true } },
      }
    });

    const csvRows = [
      [
        "Siparis ID",
        "Kullanici Adi",
        "E-posta",
        "Paket",
        "Durum",
        "Baslangic",
        "Bitis",
        "Fatura Adi",
        "Fatura E-posta",
        "Adres",
        "Sehir",
        "Posta Kodu",
        "Koç Adı",           // 👈 Yeni sütun
        "Koç Branşı"         // 👈 Yeni sütun
      ],
      ...orders.map(order => [
        order.id,
        order.user?.name || "",
        order.user?.email || "",
        order.package,
        order.status,
        order.startDate?.toISOString().split("T")[0] || "",
        order.endDate?.toISOString().split("T")[0] || "",
        order.billingInfo?.name || "",
        order.billingInfo?.email || "",
        order.billingInfo ? `${order.billingInfo.address}, ${order.billingInfo.district}` : "",
        order.billingInfo?.city || "",
        order.billingInfo?.postalCode || "",
        order.user?.assignedCoach?.name || "",
        order.user?.assignedCoach?.subject || ""
      ])
    ];

    const csvContent = csvRows.map(row =>
      row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    res.setHeader("Content-Disposition", "attachment; filename=siparisler.csv");
    res.set("Content-Type", "text/csv");
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("CSV dışa aktarma hatası:", error);
    res.status(500).json({ error: "CSV oluşturulamadı." });
  }
});

// Site ayarları - Countdown
router.put("/settings/countdown", authenticateToken, authorizeRoles("admin"), updateCountdown);

// Site ayarları - Popup
router.put("/settings/popup", authenticateToken, authorizeRoles("admin"), updatePopup);

// Site ayarları - Erken Kayıt Kampanyası
router.put("/settings/early-registration", authenticateToken, authorizeRoles("admin"), updateEarlyRegistration);

// Site ayarları - Ödeme Sayfası
router.put("/settings/payment-page", authenticateToken, authorizeRoles("admin"), updatePaymentPageSettings);
router.put("/settings/pricing-video", authenticateToken, authorizeRoles("admin"), updatePricingVideo);

// Randevu slotu yönetimi (Ücretsiz ön görüşme)
router.get("/consultation-slots", authenticateToken, authorizeRoles("admin"), getAdminConsultationSlots);
router.post("/consultation-slots/toggle", authenticateToken, authorizeRoles("admin"), toggleConsultationSlot);
router.post("/consultation-slots/bulk", authenticateToken, authorizeRoles("admin"), bulkUpdateConsultationSlots);

// Paket yönetimi
router.get("/packages", authenticateToken, authorizeRoles("admin"), (req, res, next) => {
  req.query.all = "true";
  next();
}, getAllPackages);
router.post("/packages", authenticateToken, authorizeRoles("admin"), createPackage);
router.put("/packages/:id", authenticateToken, authorizeRoles("admin"), updatePackage);
router.patch("/packages/:id/toggle-visibility", authenticateToken, authorizeRoles("admin"), togglePackageVisibility);
router.delete("/packages/:id", authenticateToken, authorizeRoles("admin"), deletePackage);

// Navbar yönetimi
router.get("/navbar", authenticateToken, authorizeRoles("admin"), getAllNavbarItems);
router.post("/navbar", authenticateToken, authorizeRoles("admin"), createNavbarItem);
router.put("/navbar/reorder", authenticateToken, authorizeRoles("admin"), reorderNavbarItems);
router.put("/navbar/:id", authenticateToken, authorizeRoles("admin"), updateNavbarItem);
router.delete("/navbar/:id", authenticateToken, authorizeRoles("admin"), deleteNavbarItem);

// Görsel yükleme (Cloudinary → WebP)
import uploadRoutes from "./upload.routes.js";
router.use("/", uploadRoutes);

export default router;