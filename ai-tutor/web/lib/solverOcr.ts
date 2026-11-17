import { apiUrl } from "@/lib/api";

/** Client helpers for Smart Solver photo/draw OCR (crop, resize, API call). */

export type OcrConfidence = "low" | "medium" | "high";
export type OcrInputSource = "upload" | "draw";
export type OcrSource =
  | "azure_vision"
  | "azure_document_intelligence"
  | "azure_openai_vision";

export interface ExtractQuestionResult {
  question_text: string;
  confidence?: OcrConfidence;
  source?: OcrSource;
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1600;

export type NormalizedCropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma >= 0 && dataUrl.toLowerCase().startsWith("data:")) {
    return dataUrl.slice(comma + 1);
  }
  return dataUrl;
}

export function estimateBytesFromBase64(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function loadImageSourceFromFile(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to <img> + data URL (older browsers / exotic formats).
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    cleanup: () => {},
  };
}

function compressImageSource(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxBytes: number,
  startMaxDim: number,
): { dataUrl: string; base64: string } {
  let maxDim = startMaxDim;
  let smallest: { dataUrl: string; base64: string; bytes: number } | null =
    null;

  while (maxDim >= 320) {
    const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight, 1));
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;

    ctx.drawImage(source, 0, 0, width, height);

    for (let quality = 0.92; quality >= 0.35; quality -= 0.07) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = stripDataUrlPrefix(dataUrl);
      const bytes = estimateBytesFromBase64(base64);
      if (bytes <= maxBytes) {
        return { dataUrl, base64 };
      }
      if (!smallest || bytes < smallest.bytes) {
        smallest = { dataUrl, base64, bytes };
      }
    }

    maxDim = Math.round(maxDim * 0.72);
  }

  if (smallest) {
    return { dataUrl: smallest.dataUrl, base64: smallest.base64 };
  }

  throw new Error("Failed to compress image");
}

/**
 * Crop a region from an image (normalized 0–1 coords) and compress for OCR.
 */
export async function cropImageDataUrl(
  dataUrl: string,
  crop: NormalizedCropRect,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<{ dataUrl: string; base64: string }> {
  const img = await loadImage(dataUrl);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  const x = clamp(crop.x, 0, 1);
  const y = clamp(crop.y, 0, 1);
  const w = clamp(crop.w, 0.02, 1 - x);
  const h = clamp(crop.h, 0.02, 1 - y);

  const sx = Math.round(x * naturalW);
  const sy = Math.round(y * naturalH);
  const sw = Math.max(1, Math.round(w * naturalW));
  const sh = Math.max(1, Math.round(h * naturalH));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to crop image");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return compressImageSource(canvas, sw, sh, maxBytes, MAX_DIMENSION);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resize/compress a photo before OCR so it stays under maxBytes (default 2 MB).
 * Also caps very large dimensions and fixes phone photo orientation when possible.
 */
/**
 * Rotate an image 90° clockwise or counter-clockwise; re-compress for OCR upload limits.
 */
export async function rotateImageDataUrl(
  dataUrl: string,
  direction: "cw" | "ccw",
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<{ dataUrl: string; base64: string }> {
  const img = await loadImage(dataUrl);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const radians = direction === "cw" ? Math.PI / 2 : -Math.PI / 2;

  const canvas = document.createElement("canvas");
  canvas.width = naturalH;
  canvas.height = naturalW;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to rotate image");

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -naturalW / 2, -naturalH / 2);

  return compressImageSource(
    canvas,
    canvas.width,
    canvas.height,
    maxBytes,
    MAX_DIMENSION,
  );
}

export async function resizeImageFile(
  file: File,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<{ dataUrl: string; base64: string }> {
  const loaded = await loadImageSourceFromFile(file);

  try {
    const longestEdge = Math.max(loaded.width, loaded.height);
    const needsCompress =
      file.size > maxBytes ||
      longestEdge > MAX_DIMENSION;

    if (!needsCompress) {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = stripDataUrlPrefix(dataUrl);
      if (estimateBytesFromBase64(base64) <= maxBytes) {
        return { dataUrl, base64 };
      }
    }

    return compressImageSource(
      loaded.source,
      loaded.width,
      loaded.height,
      maxBytes,
      MAX_DIMENSION,
    );
  } finally {
    loaded.cleanup();
  }
}

export async function extractQuestionFromImage(
  imageBase64: string,
  language = "en",
  caption?: string,
  /** Pass "draw" so the backend uses sketch OCR prompts. */
  inputSource?: OcrInputSource,
): Promise<ExtractQuestionResult> {
  const res = await fetch(apiUrl("/api/v1/solve/extract-question"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: stripDataUrlPrefix(imageBase64),
      language,
      caption: caption?.trim() || undefined,
      input_source: inputSource,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join(", ")
          : res.status === 429
            ? "Too many OCR requests — please wait a minute and try again."
            : "OCR failed";
    throw new Error(detail || "OCR failed");
  }

  return data as ExtractQuestionResult;
}
