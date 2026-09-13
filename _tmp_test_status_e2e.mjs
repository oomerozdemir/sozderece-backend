import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import "dotenv/config";

const prisma = new PrismaClient();
const BASE = "https://sozderece-backend.onrender.com";
const SECRET = process.env.JWT_SECRET;

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: "1h" });
}

function istanbulYMD(d) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  return map;
}
function mondayStart(d) {
  const { year, month, day } = istanbulYMD(d);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  const jsDay = noon.getUTCDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  noon.setUTCDate(noon.getUTCDate() + diff);
  return new Date(Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate(), -3, 0, 0, 0));
}
function istanbulDayOfWeek(d) {
  const { year, month, day } = istanbulYMD(d);
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return (jsDay + 6) % 7;
}

async function main() {
  const stamp = Date.now();
  const coachUser = await prisma.user.create({
    data: { name: "Test Koç E2E", email: `test-coach-${stamp}@example.com`, role: "coach", isVerified: true },
  });
  const coach = await prisma.coach.create({
    data: { name: "Test Koç E2E", subject: "YKS", description: "test", image: "x.png", userId: coachUser.id },
  });
  const student = await prisma.user.create({
    data: {
      name: "Test Öğrenci E2E",
      email: `test-student-${stamp}@example.com`,
      role: "student",
      isVerified: true,
      grade: "11",
      assignedCoachId: coach.id,
    },
  });

  const coachToken = sign(coachUser);
  const studentToken = sign(student);
  const weekStart = mondayStart(new Date());

  console.log("Created test coach", coachUser.id, coach.id, "and student", student.id);

  // 1. Coach creates a study plan for today with 2 items
  const dayOfWeek = istanbulDayOfWeek(new Date());
  const planRes = await fetch(`${BASE}/api/coach/students/${student.id}/study-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${coachToken}` },
    body: JSON.stringify({
      weekStart: weekStart.toISOString(),
      title: "Test Hafta",
      items: [
        { dayOfWeek, subject: "Matematik", topic: "3D Yayınları, Sayfa 45-52, 4 Test", durationMin: 60, order: 0 },
        { dayOfWeek, subject: "Fizik", topic: "Kuvvet ve Hareket, 2 Test", durationMin: 40, order: 1 },
      ],
    }),
  });
  const planJson = await planRes.json();
  console.log("prepareOrder plan status:", planRes.status, JSON.stringify(planJson).slice(0, 300));
  if (!planJson.success) throw new Error("Plan creation failed");
  const items = planJson.plan.items;

  // 2. Student fetches /me/today
  const todayRes1 = await fetch(`${BASE}/api/v1/ogrenci/me/today`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const todayJson1 = await todayRes1.json();
  console.log("getMyToday (before any status change):", todayRes1.status, JSON.stringify(todayJson1).slice(0, 400));

  // 3. Student marks item 1 as "stuck", item 2 as "done"
  const st1 = await fetch(`${BASE}/api/v1/ogrenci/me/study-plan/items/${items[0].id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ status: "stuck" }),
  });
  console.log("setStatus item1->stuck:", st1.status, JSON.stringify(await st1.json()).slice(0, 200));

  // Coach roster should now show strugglingToday for this student
  const rosterResMid = await fetch(`${BASE}/api/coach/my-students`, { headers: { Authorization: `Bearer ${coachToken}` } });
  const rosterJsonMid = await rosterResMid.json();
  const meMid = rosterJsonMid.students.find((s) => s.id === student.id);
  console.log("Roster flags after 1 stuck (expect strugglingToday=true, partialToday=false):", meMid?.strugglingToday, meMid?.partialToday);

  const st2 = await fetch(`${BASE}/api/v1/ogrenci/me/study-plan/items/${items[1].id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ status: "done" }),
  });
  console.log("setStatus item2->done:", st2.status, JSON.stringify(await st2.json()).slice(0, 200));

  // 4. Now getMyToday again — DayReport should be auto-generated (all items non-pending)
  const todayRes2 = await fetch(`${BASE}/api/v1/ogrenci/me/today`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const todayJson2 = await todayRes2.json();
  console.log("getMyToday (after all resolved):", todayRes2.status, JSON.stringify(todayJson2, null, 2));

  // 5. Coach checks today-status endpoint
  const coachTodayRes = await fetch(`${BASE}/api/coach/students/${student.id}/today`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  console.log("coach getStudentTodayForCoach:", coachTodayRes.status, JSON.stringify(await coachTodayRes.json()).slice(0, 400));

  // 6. Coach checks day-reports history
  const coachReportsRes = await fetch(`${BASE}/api/coach/students/${student.id}/day-reports`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  console.log("coach getStudentDayReports:", coachReportsRes.status, JSON.stringify(await coachReportsRes.json()).slice(0, 400));

  // 7. Coach roster flags after resolution — stuck item still stuck, so strugglingToday should remain true
  const rosterRes = await fetch(`${BASE}/api/coach/my-students`, { headers: { Authorization: `Bearer ${coachToken}` } });
  const rosterJson = await rosterRes.json();
  const me = rosterJson.students.find((s) => s.id === student.id);
  console.log("Roster flags (final, expect strugglingToday=true):", me?.strugglingToday, me?.partialToday);

  // Cleanup
  await prisma.dayReport.deleteMany({ where: { studentId: student.id } });
  await prisma.studyPlanItem.deleteMany({ where: { studyPlan: { studentId: student.id } } });
  await prisma.studyPlan.deleteMany({ where: { studentId: student.id } });
  await prisma.user.delete({ where: { id: student.id } });
  await prisma.coach.delete({ where: { id: coach.id } });
  await prisma.user.delete({ where: { id: coachUser.id } });
  console.log("Cleanup done.");
}

main()
  .catch((e) => {
    console.error("TEST FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
