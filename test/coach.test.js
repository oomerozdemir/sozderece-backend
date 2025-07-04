import request from "supertest";
import app from "../server.js"; // ❗️ default export olduğuna emin ol

describe("GET /api/coach/my-students", () => {
  it("❌ Token yoksa 401 dönmeli", async () => {
    const res = await request(app).get("/api/coach/my-students");
    expect(res.statusCode).toBe(401);
  });

  it("✅ Token varsa atanmış öğrenciler dönmeli", async () => {
    const token = "BURAYA_TOKEN_KOY"; // 🔐 Geçerli JWT token koy
    const res = await request(app)
      .get("/api/coach/my-students")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
  });
});
