"use client";

import { useRef, useLayoutEffect, useState } from "react";
import { Loader2, BookmarkPlus } from "lucide-react";
import { useKaTeXInjection } from "../hooks";
import { useTranslation } from "react-i18next";

interface HTMLViewerProps {
  html: string;
  currentIndex: number;
  loadingMessage: string;
  onSaveToNotebook?: () => void;
  containerClassName?: string;
}

/** Call after assigning iframe.srcdoc; invokes onReady when the new document has loaded. */
function listenForIframeReady(
  iframe: HTMLIFrameElement,
  onReady: () => void,
): () => void {
  let done = false;
  let cancelled = false;

  const fire = () => {
    if (cancelled || done) return;
    done = true;
    queueMicrotask(onReady);
  };

  const onLoad = () => fire();
  iframe.addEventListener("load", onLoad, { once: true });

  const checkSync = () => {
    if (cancelled || done) return;
    try {
      if (iframe.contentDocument?.readyState === "complete") {
        iframe.removeEventListener("load", onLoad);
        fire();
      }
    } catch {
      /* ignore */
    }
  };

  queueMicrotask(checkSync);
  requestAnimationFrame(checkSync);

  return () => {
    cancelled = true;
    iframe.removeEventListener("load", onLoad);
  };
}

export default function HTMLViewer({
  html,
  currentIndex,
  loadingMessage,
  onSaveToNotebook,
  containerClassName = "",
}: HTMLViewerProps) {
  const { t } = useTranslation();
  const frameRefs = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>(
    [null, null],
  );
  const lastAppliedRef = useRef<{ index: number; doc: string } | null>(null);
  const displayedRef = useRef(0);
  const hasShownRef = useRef(false);
  const navSerialRef = useRef(0);
  const { injectKaTeX } = useKaTeXInjection();
  const [displayed, setDisplayed] = useState(0);

  useLayoutEffect(() => {
    if (!html) {
      lastAppliedRef.current = null;
      hasShownRef.current = false;
      displayedRef.current = 0;
      navSerialRef.current += 1;
      setDisplayed(0);
      return;
    }

    const el0 = frameRefs.current[0];
    const el1 = frameRefs.current[1];
    if (!el0 || !el1) return;

    const htmlWithKaTeX = injectKaTeX(html);
    const prev = lastAppliedRef.current;
    if (
      prev &&
      prev.index === currentIndex &&
      prev.doc === htmlWithKaTeX
    ) {
      return;
    }
    lastAppliedRef.current = { index: currentIndex, doc: htmlWithKaTeX };

    const finishSwap = (inactive: 0 | 1, serial: number) => {
      if (serial !== navSerialRef.current) return;
      displayedRef.current = inactive;
      setDisplayed(inactive);
    };

    const applySrcdoc = (): (() => void) | void => {
      if (!hasShownRef.current) {
        hasShownRef.current = true;
        try {
          el0.srcdoc = htmlWithKaTeX;
        } catch (e) {
          console.warn("srcdoc not supported:", e);
        }
        displayedRef.current = 0;
        setDisplayed(0);
        return;
      }

      const serial = ++navSerialRef.current;
      const shown = displayedRef.current as 0 | 1;
      const inactive = (shown ^ 1) as 0 | 1;
      const hiddenEl = inactive === 0 ? el0 : el1;

      let swapped = false;
      const trySwap = () => {
        if (swapped || serial !== navSerialRef.current) return;
        swapped = true;
        finishSwap(inactive, serial);
      };

      try {
        hiddenEl.srcdoc = htmlWithKaTeX;
      } catch (e) {
        console.warn("srcdoc not supported, skipping swap buffer:", e);
        return;
      }

      return listenForIframeReady(hiddenEl, trySwap);
    };

    const cancel = applySrcdoc();
    return typeof cancel === "function" ? cancel : undefined;
  }, [html, currentIndex, injectKaTeX]);

  const iframeClass = (i: 0 | 1) =>
    `absolute inset-0 h-full w-full border-0 bg-white dark:bg-slate-800 ${
      displayed === i
        ? "z-[8] opacity-100"
        : "z-[7] opacity-0 pointer-events-none"
    }`;

  if (!html) {
    return (
      <div
        className={`w-full flex flex-col rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden p-5 gap-4 ${containerClassName}`}
        aria-busy="true"
        aria-label={loadingMessage || t("Loading learning content...")}
      >
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500 shrink-0" aria-hidden />
          <span>{loadingMessage || t("Loading learning content...")}</span>
        </div>
        <div
          className="w-full h-[min(68vh,640px)] min-h-[200px] space-y-3 animate-pulse rounded-lg bg-slate-50 dark:bg-slate-900/40 p-4"
          aria-hidden
        >
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-md w-[92%] max-w-xl" />
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-md w-full max-w-lg" />
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-md w-[80%] max-w-md" />
          <div className="h-28 bg-slate-100 dark:bg-slate-700 rounded-xl mt-6 w-full max-w-2xl mx-auto" />
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-md w-[72%] max-w-md mt-4" />
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-md w-full max-w-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden relative ${containerClassName}`}
    >
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Save to Notebook Button */}
        {onSaveToNotebook && (
          <button
            onClick={onSaveToNotebook}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-all shadow-sm shadow-indigo-500/20"
            title={t("Save to Notebook")}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            {t("Save to notebook")}
          </button>
        )}
      </div>

      {/* Fixed viewport slice — avoids flex-1 stretching in scroll parents (phantom gap below quiz) */}
      <div className="relative w-full h-[min(68vh,640px)] min-h-[200px] shrink-0">
        <iframe
          ref={(el) => {
            frameRefs.current[0] = el;
          }}
          className={iframeClass(0)}
          title={t("Interactive Learning Content")}
          sandbox="allow-scripts allow-same-origin"
        />
        <iframe
          ref={(el) => {
            frameRefs.current[1] = el;
          }}
          className={iframeClass(1)}
          title={t("Interactive Learning Content")}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
