"use client";

/** Upload Photo tab — gallery pick, camera capture, drag-and-drop. */

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isImageFile, resizeImageFile } from "@/lib/solverOcr";
import SolverCameraCapture from "@/components/solver/SolverCameraCapture";

interface SolverUploadInputProps {
  onImageReady: (previewUrl: string, base64: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function SolverUploadInput({
  onImageReady,
  disabled = false,
  loading = false,
}: SolverUploadInputProps) {
  const { t } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const busy = disabled || loading || processing;

  const handleFile = async (file: File | null | undefined) => {
    if (!file || busy) return;
    if (!isImageFile(file)) {
      setLocalError(t("solver.upload_invalid_type"));
      return;
    }

    setLocalError(null);
    setProcessing(true);
    try {
      const { dataUrl, base64 } = await resizeImageFile(file);
      onImageReady(dataUrl, base64);
    } catch {
      setLocalError(t("solver.upload_read_failed"));
    } finally {
      setProcessing(false);
    }
  };

  const onFileChange =
    (input: React.RefObject<HTMLInputElement | null>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
      e.target.value = "";
    };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const openCamera = () => {
    if (busy) return;
    setLocalError(null);
    // Desktop/laptop: live webcam. Mobile fallback uses hidden input below.
    if ("getUserMedia" in navigator.mediaDevices) {
      setCameraOpen(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <SolverCameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void handleFile(file)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange(cameraInputRef)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFileChange(galleryInputRef)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`w-full rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-900/20"
            : "border-slate-200 bg-slate-50/50 dark:border-slate-600 dark:bg-slate-900/30"
        }`}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
          {processing || loading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Camera className="h-7 w-7" />
          )}
        </div>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {loading ? t("solver.ocr_reading") : t("solver.upload_title")}
        </h4>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t("solver.upload_subtitle")}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={openCamera}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" />
            {t("solver.use_camera")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t("solver.choose_gallery")}
          </button>
        </div>
        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          {t("solver.upload_drop_hint")}
        </p>
      </div>

      {localError && (
        <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">
          {localError}
        </p>
      )}
    </div>
  );
}
