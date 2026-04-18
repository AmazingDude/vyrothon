"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const faceDetection_1 = require("../services/faceDetection");
const prisma_1 = require("../utils/prisma");
const router = (0, express_1.Router)();
// ─── Multer config ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path_1.default.resolve(process.cwd(), "uploads");
// Ensure uploads directory exists
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `selfie-${unique}${path_1.default.extname(file.originalname)}`);
    },
});
const fileFilter = (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png"];
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only .jpg, .jpeg and .png files are allowed"));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
// ─── Cleanup helper ────────────────────────────────────────────────────────────
function cleanupFile(filePath) {
    if (filePath && fs_1.default.existsSync(filePath)) {
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch {
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
router.post("/selfie", 
// Multer middleware — handles multipart/form-data field named "selfie"
upload.single("image"), async (req, res, next) => {
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
        const descriptors = await (0, faceDetection_1.detectFacesInImage)(uploadedPath);
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
        const selfieDescriptor = descriptors[0];
        const allFaces = await prisma_1.prisma.face.findMany({
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
        const match = (0, faceDetection_1.findBestMatch)(selfieDescriptor, allFaces);
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
    }
    catch (err) {
        cleanupFile(uploadedPath);
        next(err);
    }
});
exports.default = router;
