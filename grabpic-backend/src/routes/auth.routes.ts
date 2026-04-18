import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
    detectFacesInImage,
    findBestMatch,
} from "../services/faceDetection.service";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── Multer config ─────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `selfie-${unique}${path.extname(file.originalname)}`);
    },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Only .jpg, .jpeg and .png files are allowed"));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Cleanup helper ────────────────────────────────────────────────────────────

function cleanupFile(filePath?: string): void {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch {
            console.warn("[Selfie] Could not delete temp file:", filePath);
        }
    }
}

// ─── POST /auth/selfie ─────────────────────────────────────────────────────────

/**
 * Accept a selfie upload, detect the face, and match against all known faces.
 *
 * Success response:   { success: true,  grabId: string, confidence: number }
 * No-match response:  { success: false, error: "No matching face found" }
 * Error response:     { success: false, error: string }
 */
router.post(
    "/selfie",
    // Multer middleware — handles multipart/form-data field named "selfie"
    upload.single("image"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const uploadedPath = req.file?.path;

        try {
            // ── 1. Validate file was received ──────────────────────────────────
            if (!req.file || !uploadedPath) {
                res.status(400).json({
                    success: false,
                    error: 'No file uploaded. Send a selfie image in the "image" field.',
                });
                return;
            }

            // ── 2. Detect faces ────────────────────────────────────────────────
            const descriptors = await detectFacesInImage(uploadedPath);

            if (descriptors.length === 0) {
                cleanupFile(uploadedPath);
                res.status(400).json({
                    success: false,
                    error: "No face detected in the uploaded image.",
                });
                return;
            }

            if (descriptors.length > 1) {
                cleanupFile(uploadedPath);
                res.status(400).json({
                    success: false,
                    error: `Multiple faces detected (${descriptors.length}). Please upload a selfie with only one face.`,
                });
                return;
            }

            // ── 3. Fetch all known faces from Supabase ─────────────────────────
            const selfieDescriptor = descriptors[0] as Float32Array;

            const allFaces = await prisma.face.findMany({
                select: { grabId: true, descriptor: true },
            });

            if (allFaces.length === 0) {
                cleanupFile(uploadedPath);
                res.status(404).json({
                    success: false,
                    error: "No faces in the database yet. Run POST /admin/crawl first.",
                });
                return;
            }

            // ── 4. Compare and find best match ─────────────────────────────────
            const match = findBestMatch(selfieDescriptor, allFaces);

            cleanupFile(uploadedPath);

            if (match === null) {
                res.status(200).json({
                    success: false,
                    error: "No matching face found.",
                });
                return;
            }

            // ── 5. Return result ───────────────────────────────────────────────
            res.status(200).json({
                success: true,
                grabId: match.grabId,
                confidence: parseFloat(match.confidence.toFixed(4)),
            });
        } catch (err) {
            cleanupFile(uploadedPath);
            next(err);
        }
    },
);

export default router;
