import express from "express";
import {
  getStudentStudyPlanForCoach, upsertStudentStudyPlan,
  getStudentExamResultsForCoach,
  getStudentTodayForCoach, getStudentDayReports,
  getInsightsForCoach, addInsightTopicToPlan, getTopicsForCoach, getMasteryForCoach,
  getStudentAiQuestionInsightsForCoach,
  getNotesForCoach, createTextNote, createAudioNote,
  getResourcesForCoach,
} from "../../controllers/coach.controller.js";
import {
  getMyCoaches, getCoachDetailForHeadCoach, getMyStudents, getOverview,
  getSosAlertsForHeadCoach, transferStudentWithinTeam,
} from "../../controllers/headCoach.controller.js";
import { authenticateToken, authorizeRoles } from "../../middleware/authMiddleware.js";
import { uploadAudio } from "../../middleware/upload.js";

const router = express.Router();
const guard = [authenticateToken, authorizeRoles("head_coach")];

// Yeni — head coach'a özel aggregate/roster uçları (bkz. plan K9).
router.get("/overview", ...guard, getOverview);
router.get("/coaches", ...guard, getMyCoaches);
router.get("/coaches/:coachId", ...guard, getCoachDetailForHeadCoach);
router.get("/students", ...guard, getMyStudents);
router.patch("/students/:studentId/coach", ...guard, transferStudentWithinTeam);
router.get("/sos-alerts", ...guard, getSosAlertsForHeadCoach);

// Reuse — coach.controller.js'teki AYNI fonksiyonlar; içeride
// resolveStudentAccess() role'e göre dallanıp iki-küme (kendi + supervise
// ettiği coach'lar) kontrolünü uyguluyor. addStudentExamResult/
// resolveSosAlert/resource-CRUD BİLEREK burada YOK (plan K6/K9 — V1'de
// head coach'a kapalı operasyonel detaylar).
router.get("/students/:studentId/study-plan", ...guard, getStudentStudyPlanForCoach);
router.post("/students/:studentId/study-plan", ...guard, upsertStudentStudyPlan);
router.get("/students/:studentId/exam-results", ...guard, getStudentExamResultsForCoach);
router.get("/students/:studentId/today", ...guard, getStudentTodayForCoach);
router.get("/students/:studentId/day-reports", ...guard, getStudentDayReports);
router.get("/students/:studentId/topics", ...guard, getTopicsForCoach);
router.get("/students/:studentId/mastery", ...guard, getMasteryForCoach);
router.get("/students/:studentId/insights", ...guard, getInsightsForCoach);
router.post("/students/:studentId/insights/:topicId/add-to-plan", ...guard, addInsightTopicToPlan);
router.get("/students/:studentId/ai-question-insights", ...guard, getStudentAiQuestionInsightsForCoach);
router.get("/students/:studentId/notes", ...guard, getNotesForCoach);
router.post("/students/:studentId/notes/text", ...guard, createTextNote);
router.post("/students/:studentId/notes/audio", ...guard, uploadAudio.single("audio"), createAudioNote);
router.get("/students/:studentId/resources", ...guard, getResourcesForCoach);

export default router;
