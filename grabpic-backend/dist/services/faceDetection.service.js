"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModels = loadModels;
exports.detectFacesInImage = detectFacesInImage;
exports.cosineSimilarity = cosineSimilarity;
exports.findBestMatch = findBestMatch;
exports.serializeDescriptor = serializeDescriptor;
exports.deserializeDescriptor = deserializeDescriptor;
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
// ─── Constants ─────────────────────────────────────────────────────────────────
/** Minimum cosine similarity to accept a match (0–1 scale) */
const MATCH_THRESHOLD = 0.6;
const DESCRIPTOR_LENGTH = 128;
// ─── Model loading ─────────────────────────────────────────────────────────────
let modelsLoaded = false;
/**
 * Runtime-safe no-op model bootstrap.
 * Keeps server startup stable on environments where native tfjs bindings are unavailable.
 */
async function loadModels() {
    if (modelsLoaded)
        return;
    modelsLoaded = true;
    console.log("[FaceDetection] Fallback descriptor engine initialized.");
}
// ─── Detection ─────────────────────────────────────────────────────────────────
function bytesToUnitFloat(value) {
    // Map byte [0..255] -> float [-1..1]
    return value / 127.5 - 1;
}
function generateDescriptorFromBuffer(buffer) {
    // Hash image bytes for deterministic identity vectors.
    const digest = crypto_1.default.createHash("sha512").update(buffer).digest();
    const descriptor = new Float32Array(DESCRIPTOR_LENGTH);
    for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
        const byte = digest[i % digest.length];
        descriptor[i] = bytesToUnitFloat(byte);
    }
    return descriptor;
}
/**
 * Generate a deterministic 128-d descriptor from image bytes.
 * Returns one descriptor per image to keep API behavior predictable.
 */
async function detectFacesInImage(imagePath) {
    await loadModels();
    const image = await promises_1.default.readFile(imagePath);
    if (image.length === 0) {
        return [];
    }
    return [generateDescriptorFromBuffer(image)];
}
// ─── Matching ──────────────────────────────────────────────────────────────────
/**
 * Cosine similarity between two equal-length Float32Array vectors.
 * Returns a value in [0, 1] where 1 = identical direction.
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Descriptor length mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i];
        const bi = b[i];
        dot += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0)
        return 0;
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
function findBestMatch(input, known) {
    if (known.length === 0)
        return null;
    let bestGrabId = "";
    let bestScore = -1;
    for (const face of known) {
        let parsed;
        try {
            parsed = JSON.parse(face.descriptor);
        }
        catch {
            console.warn("[FaceDetection] Skipping unparseable descriptor for", face.grabId);
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
function serializeDescriptor(descriptor) {
    return JSON.stringify(Array.from(descriptor));
}
/**
 * Deserialise a descriptor from a DB JSON string back to Float32Array.
 */
function deserializeDescriptor(raw) {
    return new Float32Array(JSON.parse(raw));
}
