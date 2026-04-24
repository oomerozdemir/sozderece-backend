import express from "express";
import { getCountdown, getPopup, getPaymentPageSettings, getEarlyRegistration } from "../../controllers/siteSettings.controller.js";

const router = express.Router();

router.get("/countdown", getCountdown);
router.get("/popup", getPopup);
router.get("/payment-page", getPaymentPageSettings);
router.get("/early-registration", getEarlyRegistration);

export default router;
