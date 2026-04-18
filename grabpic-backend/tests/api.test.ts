import request from "supertest";

describe("Grabpic API", () => {
    const api = request("http://localhost:3000");

    it("POST /admin/crawl returns 200 with totalImages field", async () => {
        const response = await api.post("/admin/crawl");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("totalImages");
    });

    it("POST /auth/selfie with no file returns 400", async () => {
        const response = await api.post("/auth/selfie");

        expect(response.status).toBe(400);
    });

    it("GET /images/invalid-id returns 404", async () => {
        const response = await api.get("/images/invalid-id");

        expect(response.status).toBe(404);
    });
});
