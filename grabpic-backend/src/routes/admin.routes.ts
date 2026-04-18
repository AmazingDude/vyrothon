import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import {
    detectFacesInImage,
    findBestMatch,
    serializeDescriptor,
} from "../services/faceDetection.service";
import { prisma } from "../utils/prisma";

const router = Router();

/** Supported image extensions */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

/** Absolute path to the sample-images folder (project root) */
const SAMPLE_IMAGES_DIR = path.resolve(
    process.cwd(),
    process.env["SAMPLE_IMAGES_DIR"] ?? "sample-images",
);

// ─── POST /admin/crawl ────────────────────────────────────────────────────────

/**
 * Crawl ./sample-images, detect faces, and persist Image + Face + ImageFace
 * records in Supabase (via Prisma).
 *
 * Response shape:
 * {
 *   success: true,
 *   summary: {
 *     imagesProcessed: number,
 *     facesFound: number,
 *     newFaces: number,
 *     mappingsCreated: number,
 *     processingTimeMs: number
 *   }
 * }
 */
router.post(
    "/crawl",
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
        const startTime = Date.now();

        try {
            // ── 1. Read image files ──────────────────────────────────────────────
            if (!fs.existsSync(SAMPLE_IMAGES_DIR)) {
                res.status(400).json({
                    success: false,
                    error: `sample-images directory not found at: ${SAMPLE_IMAGES_DIR}`,
                });
                return;
            }

            const allFiles = fs.readdirSync(SAMPLE_IMAGES_DIR);
            const imageFiles = allFiles.filter((f) =>
                IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()),
            );

            if (imageFiles.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "No .jpg / .jpeg / .png files found in sample-images/",
                });
                return;
            }

            // ── 2. Process each image ────────────────────────────────────────────
            let facesFound = 0;
            let newFaces = 0;
            let mappingsCreated = 0;
            const errors: string[] = [];

            for (const fileName of imageFiles) {
                const filePath = path.join(SAMPLE_IMAGES_DIR, fileName);

                try {
                    // Detect faces
                    const descriptors = await detectFacesInImage(filePath);

                    if (descriptors.length === 0) {
                        console.log(`[Crawl] No faces in: ${fileName}`);
                        continue;
                    }

                    facesFound += descriptors.length;

                    // Upsert Image record
                    const imageRecord = await prisma.image.upsert({
                        where: { filePath },
                        update: {},
                        create: { filePath },
                    });

                    // Process each face descriptor
                    for (const descriptor of descriptors) {
                        // Fetch all existing faces for comparison
                        const existingFaces = await prisma.face.findMany({
                            select: { grabId: true, descriptor: true },
                        });

                        const match = findBestMatch(descriptor, existingFaces);

                        let faceId: string;

                        if (match === null) {
                            // New face — create record
                            const newFace = await prisma.face.create({
                                data: {
                                    descriptor: serializeDescriptor(descriptor),
                                },
                            });
                            faceId = newFace.grabId;
                            newFaces++;
                            console.log(`[Crawl] New face created: ${faceId}`);
                        } else {
                            faceId = match.grabId;
                            console.log(
                                `[Crawl] Existing face matched: ${faceId} (confidence: ${match.confidence.toFixed(3)})`,
                            );
                        }

                        // Create ImageFace mapping (skip if already exists)
                        const existingMapping =
                            await prisma.imageFace.findFirst({
                                where: { imageId: imageRecord.id, faceId },
                            });

                        if (!existingMapping) {
                            await prisma.imageFace.create({
                                data: { imageId: imageRecord.id, faceId },
                            });
                            mappingsCreated++;
                        }
                    }
                } catch (fileErr) {
                    const msg =
                        fileErr instanceof Error
                            ? fileErr.message
                            : String(fileErr);
                    console.error(`[Crawl] Error processing ${fileName}:`, msg);
                    errors.push(`${fileName}: ${msg}`);
                }
            }

            // ── 3. Respond ───────────────────────────────────────────────────────
            res.status(200).json({
                success: true,
                summary: {
                    imagesProcessed: imageFiles.length,
                    facesFound,
                    newFaces,
                    mappingsCreated,
                    processingTimeMs: Date.now() - startTime,
                    ...(errors.length > 0 && { errors }),
                },
            });
        } catch (err) {
            next(err);
        }
    },
);

export default router;
