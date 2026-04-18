"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const faceDetection_1 = require("./services/faceDetection");
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const images_routes_1 = __importDefault(require("./routes/images.routes"));
const swagger_1 = require("./swagger");
const errorHandler_1 = require("./middleware/errorHandler");
const prisma_1 = require("./utils/prisma");
// ─── App + Prisma ──────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
// ─── Middleware ────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)("dev"));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// ─── Routes ────────────────────────────────────────────────────────────────────
app.use("/admin", admin_routes_1.default);
app.use("/auth", auth_routes_1.default);
app.use("/images", images_routes_1.default);
app.use("/api-docs", swagger_1.swaggerUi.serve, swagger_1.swaggerUi.setup(swagger_1.swaggerSpec));
app.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Grabpic backend is running.",
        endpoints: {
            health: "/health",
            docs: "/api-docs",
            crawl: "POST /admin/crawl",
            selfieAuth: "POST /auth/selfie",
            imagesByGrabId: "GET /images/:grabId",
        },
    });
});
// ─── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
// ─── 404 + Global error handler ───────────────────────────────────────────────
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
// ─── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
    await prisma_1.prisma.$disconnect();
    console.log("[Server] Prisma disconnected. Bye!");
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
    try {
        // 1. Load face-api.js models before accepting any requests
        console.log("[Server] Loading face detection models...");
        await (0, faceDetection_1.loadModels)();
        console.log("[Server] ✅ Face models loaded.");
        // 2. Verify Prisma can reach Supabase
        await prisma_1.prisma.$connect();
        console.log("[Server] ✅ Connected to Supabase.");
        // 3. Start listening
        app.listen(PORT, () => {
            console.log(`[Server] 🚀 Running on http://localhost:${PORT}`);
            console.log("[Server] Routes:");
            console.log(`         POST /admin/crawl`);
            console.log(`         POST /auth/selfie`);
            console.log(`         GET  /images/:grabId`);
            console.log(`         GET  /health`);
        });
    }
    catch (err) {
        console.error("[Server] ❌ Failed to start:", err);
        await prisma_1.prisma.$disconnect();
        process.exit(1);
    }
}
void bootstrap();
