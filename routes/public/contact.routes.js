import express from "express";
import { createContact, createTrialMeeting } from "../../controllers/contact.controller.js";

const router = express.Router();

router.post("/", createContact); 
router.post("/trial", createTrialMeeting);


export default router;
