"use client";

/** In-app camera modal for the Upload Photo tab (mobile-friendly). */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SolverCameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function SolverCameraCapture({
  open,
  onClose,
  onCapture,
}: SolverCameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      setCapturing(false);
      setMaximized(false);
      return;
    }

    let cancelled = false;

    const start = async () => {
      if (!("getUserMedia" in navigator.mediaDevices)) {
        setError(t("solver.camera_not_supported"));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        setError(null);
      } catch {
        if (!cancelled) {
          setError(t("solver.camera_permission_denied"));
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream, t]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !ready || capturing) return;

    setCapturing(true);
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");

      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("blob");

      const file = new File([blob], `solver-camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      stopStream();
      onCapture(file);
      onClose();
    } catch {
      setError(t("solver.camera_capture_failed"));
    } finally {
      setCapturing(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/60 ${
        maximized ? "p-0" : "items-center justify-center p-4"
      }`}
    >
      <div
        className={`flex w-full flex-col overflow-hidden bg-white shadow-xl dark:bg-slate-900 ${
          maximized
            ? "h-full rounded-none"
            : "max-w-lg rounded-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("solver.camera_title")}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMaximized((m) => !m)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={
                maximized
                  ? t("solver.camera_minimize")
                  : t("solver.camera_maximize")
              }
            >
              {maximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={t("solver.camera_close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={`relative min-h-0 flex-1 bg-black ${
            maximized ? "" : "aspect-[4/3]"
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("solver.camera_cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={!ready || capturing || !!error}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {capturing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {t("solver.camera_capture")}
          </button>
        </div>
      </div>
    </div>
  );
}
