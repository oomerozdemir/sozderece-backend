import express from "express";
import { getCountdown, getPopup, getPaymentPageSettings, getPricingVideo } from "../../controllers/siteSettings.controller.js";
import { getNavbarItems } from "../../controllers/navbarItem.controller.js";

const router = express.Router();

router.get("/countdown", getCountdown);
router.get("/popup", getPopup);
router.get("/payment-page", getPaymentPageSettings);
router.get("/pricing-video", getPricingVideo);
router.get("/navbar", getNavbarItems);

export default router;
