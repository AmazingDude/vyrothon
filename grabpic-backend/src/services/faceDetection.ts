import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Canvas, Image, ImageData, loadImage } from "canvas";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KnownFace {
    grabId: string;
    /** JSON-serialised Float32Array stored in DB (e.g. "[0.12, -0.34, ...]") */
    descriptor: string;
}

export interface MatchResult {
    grabId: string;
    confidence: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Minimum cosine similarity to accept a match (0–1 scale) */
const MATCH_THRESHOLD = 0.6;
const DESCRIPTOR_LENGTH = 128;

// ─── Model loading ─────────────────────────────────────────────────────────────

let modelsLoaded = false;
let faceApiReady = false;
let faceapiLib: any = null;

/**
 * Load face-api detection and recognition networks from disk once.
 */
export async function loadModels(): Promise<void> {
    if (modelsLoaded) return;

    try {
        faceapiLib = await import("@vladmandic/face-api");
        faceapiLib.env.monkeyPatch({ Canvas, Image, ImageData });

        const modelPath = path.resolve(
            process.cwd(),
            process.env["FACE_MODELS_DIR"] ?? "models",
        );

        await Promise.all([
            faceapiLib.nets.ssdMobilenetv1.loadFromDisk(modelPath),
            faceapiLib.nets.faceLandmark68Net.loadFromDisk(modelPath),
            faceapiLib.nets.faceRecognitionNet.loadFromDisk(modelPath),
        ]);

        faceApiReady = true;
        console.log("[FaceDetection] Models loaded from disk:", modelPath);
    } catch (err) {
        faceApiReady = false;
        faceapiLib = null;
        console.warn(
            "[FaceDetection] face-api unavailable (missing @tensorflow/tfjs-node or model setup). Falling back to deterministic descriptors.",
        );
        console.warn(
            "[FaceDetection] Fallback mode only matches near-identical images, not true cross-photo face recognition.",
        );
        if (err instanceof Error) {
            console.warn(`[FaceDetection] Reason: ${err.message}`);
        }
    }

    modelsLoaded = true;
}

// ─── Detection ─────────────────────────────────────────────────────────────────

function bytesToUnitFloat(value: number): number {
    return value / 127.5 - 1;
}

function generateDescriptorFromBuffer(buffer: Buffer): Float32Array {
    const digest = crypto
        .createHash("sha512")
        .update(buffer)
        .digest();
    const descriptor = new Float32Array(DESCRIPTOR_LENGTH);

    for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
        const byte = digest[i % digest.length] as number;
        descriptor[i] = bytesToUnitFloat(byte);
    }

    return descriptor;
}

/**
 * Detect all faces in an image and return a descriptor for each face.
 */
export async function detectFacesInImage(
    imagePath: string,
): Promise<Float32Array[]> {
    await loadModels();

    const image = await fs.readFile(imagePath);
    if (image.length === 0) {
        return [];
    }

    if (!faceApiReady || !faceapiLib) {
        return [generateDescriptorFromBuffer(image)];
    }

    const input = await loadImage(imagePath);

    const detections = await faceapiLib
        .detectAllFaces(input)
        .withFaceLandmarks()
        .withFaceDescriptors();

    if (detections.length === 0) {
        return [];
    }

    return detections.map((detection: any) => detection.descriptor);
}

// ─── Matching ──────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length Float32Array vectors.
 * Returns a value in [0, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
        throw new Error(
            `Descriptor length mismatch: ${a.length} vs ${b.length}`,
        );
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        const ai = a[i] as number;
        const bi = b[i] as number;
        dot += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    // Clamp to [0, 1] to guard against floating-point drift
    return Math.min(1, Math.max(0, dot / denominator));
}

/**
 * Find the best-matching face among a set of known faces.
 *
 * @param input  - 128-d descriptor from the uploaded selfie.
 * @param known  - Rows from the Face table (grabId + serialised descriptor).
 * @returns The best match if its confidence exceeds the threshold, otherwise null.
 */
export function findBestMatch(
    input: Float32Array,
    known: KnownFace[],
): MatchResult | null {
    if (known.length === 0) return null;

    let bestGrabId = "";
    let bestScore = -1;

    for (const face of known) {
        let parsed: number[];

        try {
            parsed = JSON.parse(face.descriptor) as number[];
        } catch {
            console.warn(
                "[FaceDetection] Skipping unparseable descriptor for",
                face.grabId,
            );
            continue;
        }

        const knownDescriptor = new Float32Array(parsed);
        const score = cosineSimilarity(input, knownDescriptor);

        if (score > bestScore) {
            bestScore = score;
            bestGrabId = face.grabId;
        }
    }

    if (bestScore < MATCH_THRESHOLD || bestGrabId === "") {
        return null;
    }

    return { grabId: bestGrabId, confidence: bestScore };
}

// ─── Serialisation helpers ─────────────────────────────────────────────────────

/**
 * Serialise a Float32Array descriptor to a JSON string for DB storage.
 */
export function serializeDescriptor(descriptor: Float32Array): string {
    return JSON.stringify(Array.from(descriptor));
}

/**
 * Deserialise a descriptor from a DB JSON string back to Float32Array.
 */
export function deserializeDescriptor(raw: string): Float32Array {
    return new Float32Array(JSON.parse(raw) as number[]);
}
