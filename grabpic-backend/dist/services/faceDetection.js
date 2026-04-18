"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const path_1 = __importDefault(require("path"));
const canvas_1 = require("canvas");
// ─── Constants ─────────────────────────────────────────────────────────────────
/** Minimum cosine similarity to accept a match (0–1 scale) */
const MATCH_THRESHOLD = 0.6;
const DESCRIPTOR_LENGTH = 128;
// ─── Model loading ─────────────────────────────────────────────────────────────
let modelsLoaded = false;
let faceApiReady = false;
let faceapiLib = null;
/**
 * Load face-api detection and recognition networks from disk once.
 */
async function loadModels() {
    if (modelsLoaded)
        return;
    try {
        faceapiLib = await Promise.resolve().then(() => __importStar(require("@vladmandic/face-api")));
        faceapiLib.env.monkeyPatch({ Canvas: canvas_1.Canvas, Image: canvas_1.Image, ImageData: canvas_1.ImageData });
        const modelPath = path_1.default.resolve(process.cwd(), process.env["FACE_MODELS_DIR"] ?? "models");
        await Promise.all([
            faceapiLib.nets.ssdMobilenetv1.loadFromDisk(modelPath),
            faceapiLib.nets.faceLandmark68Net.loadFromDisk(modelPath),
            faceapiLib.nets.faceRecognitionNet.loadFromDisk(modelPath),
        ]);
        faceApiReady = true;
        console.log("[FaceDetection] Models loaded from disk:", modelPath);
    }
    catch (err) {
        faceApiReady = false;
        faceapiLib = null;
        console.warn("[FaceDetection] face-api unavailable (missing @tensorflow/tfjs-node or model setup). Falling back to deterministic descriptors.");
        console.warn("[FaceDetection] Fallback mode only matches near-identical images, not true cross-photo face recognition.");
        if (err instanceof Error) {
            console.warn(`[FaceDetection] Reason: ${err.message}`);
        }
    }
    modelsLoaded = true;
}
// ─── Detection ─────────────────────────────────────────────────────────────────
function bytesToUnitFloat(value) {
    return value / 127.5 - 1;
}
function generateDescriptorFromBuffer(buffer) {
    const digest = crypto_1.default
        .createHash("sha512")
        .update(buffer)
        .digest();
    const descriptor = new Float32Array(DESCRIPTOR_LENGTH);
    for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
        const byte = digest[i % digest.length];
        descriptor[i] = bytesToUnitFloat(byte);
    }
    return descriptor;
}
/**
 * Detect all faces in an image and return a descriptor for each face.
 */
async function detectFacesInImage(imagePath) {
    await loadModels();
    const image = await promises_1.default.readFile(imagePath);
    if (image.length === 0) {
        return [];
    }
    if (!faceApiReady || !faceapiLib) {
        return [generateDescriptorFromBuffer(image)];
    }
    const input = await (0, canvas_1.loadImage)(imagePath);
    const detections = await faceapiLib
        .detectAllFaces(input)
        .withFaceLandmarks()
        .withFaceDescriptors();
    if (detections.length === 0) {
        return [];
    }
    return detections.map((detection) => detection.descriptor);
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
