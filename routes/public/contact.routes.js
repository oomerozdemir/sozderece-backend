import express from "express";
import { createContact } from "../../controllers/contact.controller.js";
import { getConsultationSlots } from "../../controllers/consultationSlot.controller.js";

const router = express.Router();

router.post("/", createContact);
router.get("/slots", getConsultationSlots);


export default router;
