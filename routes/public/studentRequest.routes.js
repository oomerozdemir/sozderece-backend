// routes/public/studentRequest.routes.js
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

/* 1) Spesifik rota ÖNCE */
r.get("/me", authenticateToken, listMyRequests);

/* 2) CRUD */
r.post("/", authenticateToken, createStudentRequest);
r.get("/:id", authenticateToken, getStudentRequest);
r.post("/:id/package", authenticateToken, attachPackageToRequest);
r.post("/:id/paid", authenticateToken, markRequestPaid);
r.post("/:id/slots", authenticateToken, saveRequestSlots);

export default r;
