"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../utils/prisma");
const router = (0, express_1.Router)();
// ─── UUID validation ───────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(value) {
    return UUID_REGEX.test(value);
}
// ─── Prisma result type ────────────────────────────────────────────────────────
// Derive the type directly from the Prisma query so it stays in sync
const imageFaceWithImage = client_1.Prisma.validator()({
    include: { image: true },
});
// ─── GET /images/:grabId ───────────────────────────────────────────────────────
/**
 * Return all images associated with a given grabId (face identity).
 *
 * Success (200):
 * { success: true, grabId, totalImages, images: [{ imageId, filePath, uploadedAt }] }
 *
 * Not found (404):
 * { success: false, error: "No face found with grabId: ..." }
 *
 * Bad request (400):
 * { success: false, error: "Invalid grabId ..." }
 */
router.get("/:grabId", async (req, res, next) => {
    // Express route params are always strings at runtime even though
    // the TS type is string | string[] — extract and assert safely.
    const grabId = req.params["grabId"];
    try {
        // ── 1. Validate UUID format ─────────────────────────────────────────
        if (!grabId || !isValidUUID(grabId)) {
            res.status(400).json({
                success: false,
                error: "Invalid grabId — must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).",
            });
            return;
        }
        // ── 2. Verify the face exists ───────────────────────────────────────
        const faceExists = await prisma_1.prisma.face.findUnique({
            where: { grabId },
            select: { grabId: true },
        });
        if (!faceExists) {
            res.status(404).json({
                success: false,
                error: `No face found with grabId: ${grabId}`,
            });
            return;
        }
        // ── 3. Fetch all ImageFace mappings with their Image records ────────
        const imageFaces = await prisma_1.prisma.imageFace.findMany({
            where: { faceId: grabId },
            include: { image: true },
            orderBy: { image: { uploadedAt: "desc" } },
        });
        // ── 4. Map to clean response shape ──────────────────────────────────
        const images = imageFaces.map((entry) => ({
            imageId: entry.image.id,
            filePath: entry.image.filePath,
            uploadedAt: entry.image.uploadedAt,
        }));
        const response = {
            success: true,
            grabId,
            totalImages: images.length,
            images,
        };
        res.status(200).json(response);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
