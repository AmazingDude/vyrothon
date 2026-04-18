import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── UUID validation ───────────────────────────────────────────────────────────

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

// ─── Prisma result type ────────────────────────────────────────────────────────

// Derive the type directly from the Prisma query so it stays in sync
const imageFaceWithImage = Prisma.validator<Prisma.ImageFaceDefaultArgs>()({
    include: { image: true },
});
type ImageFaceWithImage = Prisma.ImageFaceGetPayload<typeof imageFaceWithImage>;

// ─── Response types ────────────────────────────────────────────────────────────

interface ImageEntry {
    imageId: string;
    filePath: string;
    uploadedAt: Date;
}

interface ImagesResponse {
    success: true;
    grabId: string;
    totalImages: number;
    images: ImageEntry[];
}

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
router.get(
    "/:grabId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Express route params are always strings at runtime even though
        // the TS type is string | string[] — extract and assert safely.
        const grabId = req.params["grabId"] as string;

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
            const faceExists = await prisma.face.findUnique({
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
            const imageFaces: ImageFaceWithImage[] =
                await prisma.imageFace.findMany({
                    where: { faceId: grabId },
                    include: { image: true },
                    orderBy: { image: { uploadedAt: "desc" } },
                });

            // ── 4. Map to clean response shape ──────────────────────────────────
            const images: ImageEntry[] = imageFaces.map((entry) => ({
                imageId: entry.image.id,
                filePath: entry.image.filePath,
                uploadedAt: entry.image.uploadedAt,
            }));

            const response: ImagesResponse = {
                success: true,
                grabId,
                totalImages: images.length,
                images,
            };

            res.status(200).json(response);
        } catch (err) {
            next(err);
        }
    },
);

export default router;
