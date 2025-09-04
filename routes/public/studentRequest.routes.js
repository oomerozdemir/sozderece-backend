import { Router } from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  createStudentRequest,
  getStudentRequest,
  attachPackageToRequest,
  markRequestPaid,
  saveRequestSlots,
} from "../../controllers/studentRequest.controller.js";

const r = Router();

r.post("/", authenticateToken, createStudentRequest);
r.get("/:id", authenticateToken, getStudentRequest);
r.put("/:id/package", authenticateToken, attachPackageToRequest);
r.put("/:id/paid", authenticateToken, markRequestPaid);
r.post("/:id/slots", authenticateToken, saveRequestSlots);

export default r;
