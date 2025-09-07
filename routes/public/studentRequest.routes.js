import { Router } from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  createStudentRequest,
  getStudentRequest,
  attachPackageToRequest,
  markRequestPaid,
  saveRequestSlots,
  listMyRequests,
} from "../../controllers/studentRequest.controller.js";

const r = Router();

/* Önce spesifik rotalar */
r.get("/me", authenticateToken, listMyRequests);                 // ← /:id'den ÖNCE

/* CRUD */
r.post("/", authenticateToken, createStudentRequest);

/* İsteğe bağlı: :id için basit cuid benzeri bir kısıt (harf-rakam, 10+ chars) */
r.get("/:id([a-zA-Z0-9_-]{10,})", authenticateToken, getStudentRequest);

r.put("/:id([a-zA-Z0-9_-]{10,})/package", authenticateToken, attachPackageToRequest);
r.put("/:id([a-zA-Z0-9_-]{10,})/paid", authenticateToken, markRequestPaid);
r.post("/:id([a-zA-Z0-9_-]{10,})/slots", authenticateToken, saveRequestSlots);

export default r;
