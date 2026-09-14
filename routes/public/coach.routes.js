import express from "express";
import { PrismaClient } from "@prisma/client";
import {
  getAssignedStudents, getAllPublicCoaches,
  getStudentStudyPlanForCoach, upsertStudentStudyPlan,
  getStudentExamResultsForCoach, addStudentExamResult,
  getStudentTodayForCoach, getStudentDayReports,
  getSosAlertsForCoach, resolveSosAlert,
  getInsightsForCoach, addInsightTopicToPlan, getTopicsForCoach,
  getNotesForCoach, createTextNote, createAudioNote,
} from "../../controllers/coach.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { uploadAudio } from "../../middleware/upload.js";

const prisma = new PrismaClient();
const router = express.Router();

// Public: Öğrenciler için koçları getir
router.get("/my-students", authenticateToken, authorizeRoles("coach"), getAssignedStudents);
router.get("/public-coach", getAllPublicCoaches);

/* Öğrenci Paneli (Faz 1) — koç tarafı veri girişi */
router.get("/students/:studentId/study-plan", authenticateToken, authorizeRoles("coach"), getStudentStudyPlanForCoach);
router.post("/students/:studentId/study-plan", authenticateToken, authorizeRoles("coach"), upsertStudentStudyPlan);
router.get("/students/:studentId/exam-results", authenticateToken, authorizeRoles("coach"), getStudentExamResultsForCoach);
router.post("/students/:studentId/exam-results", authenticateToken, authorizeRoles("coach"), addStudentExamResult);
router.get("/students/:studentId/today", authenticateToken, authorizeRoles("coach"), getStudentTodayForCoach);
router.get("/students/:studentId/day-reports", authenticateToken, authorizeRoles("coach"), getStudentDayReports);
router.get("/sos-alerts", authenticateToken, authorizeRoles("coach"), getSosAlertsForCoach);
router.patch("/sos-alerts/:id/resolve", authenticateToken, authorizeRoles("coach"), resolveSosAlert);
router.get("/students/:studentId/topics", authenticateToken, authorizeRoles("coach"), getTopicsForCoach);
router.get("/students/:studentId/insights", authenticateToken, authorizeRoles("coach"), getInsightsForCoach);
router.post("/students/:studentId/insights/:topicId/add-to-plan", authenticateToken, authorizeRoles("coach"), addInsightTopicToPlan);
router.get("/students/:studentId/notes", authenticateToken, authorizeRoles("coach"), getNotesForCoach);
router.post("/students/:studentId/notes/text", authenticateToken, authorizeRoles("coach"), createTextNote);
router.post("/students/:studentId/notes/audio", authenticateToken, authorizeRoles("coach"), uploadAudio.single("audio"), createAudioNote);


export default router;
