import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { loadModels } from "./services/faceDetection";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import imagesRoutes from "./routes/images.routes";
import { prisma } from "./utils/prisma";

// ─── App + Prisma ──────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ────────────────────────────────────────────────────────────────────

app.use("/admin", adminRoutes);
app.use("/auth", authRoutes);
app.use("/images", imagesRoutes);

// ─── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found." });
});

// ─── Global error handler ──────────────────────────────────────────────────────

app.use(
    (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
    ) => {
        // Multer errors (file size, unexpected field, etc.)
        if (err.name === "MulterError") {
            res.status(400).json({ success: false, error: err.message });
            return;
        }

        console.error("[Error]", err);

        res.status(500).json({
            success: false,
            error:
                process.env["NODE_ENV"] === "production"
                    ? "Internal server error."
                    : err.message,
        });
    },
);

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
    await prisma.$disconnect();
    console.log("[Server] Prisma disconnected. Bye!");
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
    try {
        // 1. Load face-api.js models before accepting any requests
        console.log("[Server] Loading face detection models...");
        await loadModels();
        console.log("[Server] ✅ Face models loaded.");

        // 2. Verify Prisma can reach Supabase
        await prisma.$connect();
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
    } catch (err) {
        console.error("[Server] ❌ Failed to start:", err);
        await prisma.$disconnect();
        process.exit(1);
    }
}

void bootstrap();
