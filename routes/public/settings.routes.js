import express from "express";
import { getCountdown, getPopup, getPaymentPageSettings } from "../../controllers/siteSettings.controller.js";

const router = express.Router();

router.get("/countdown", getCountdown);
router.get("/popup", getPopup);
router.get("/payment-page", getPaymentPageSettings);

export default router;
