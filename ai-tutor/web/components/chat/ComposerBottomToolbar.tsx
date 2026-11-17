"use client";

import { Lightbulb, Mic, MicOff, Plus, Send, Sparkles, Square, X } from "lucide-react";

export type ComposerVariant = "welcome" | "thread" | "student";

function ThinkingModeChip({
  onRemove,
  variant,
  t,
}: {
  onRemove: () => void;
  variant: ComposerVariant;
  t: (key: string) => string;
}) {
  const size =
    variant === "welcome" ? "text-sm px-2.5 py-1.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border border-sky-300/90 bg-sky-50 font-medium text-sky-700 shadow-sm dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300 ${size}`}
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate">{t("Think")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-sky-200/80 dark:hover:bg-sky-400/25"
        aria-label={t("home.turnOffThinking")}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </span>
  );
}

function GeneralModeChip({
  onRemove,
  variant,
  t,
}: {
  onRemove: () => void;
  variant: ComposerVariant;
  t: (key: string) => string;
}) {
  const size =
    variant === "welcome" ? "text-sm px-2.5 py-1.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border border-emerald-300/90 bg-emerald-50 font-medium text-emerald-700 shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300 ${size}`}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate">{t("General")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-emerald-200/80 dark:hover:bg-emerald-400/25"
        aria-label={t("home.turnOffGeneral")}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </span>
  );
}

export function ComposerBottomToolbar({
  variant,
  plusMenuOpen,
  setPlusMenuOpen,
  enableThinking,
  onClearThinking,
  enableGeneral,
  onClearGeneral,
  handleVoiceToggle,
  isListening,
  onSend,
  onStop,
  sendDisabled,
  isLoading,
  t,
  showPlusMenu = true,
  showMic = true,
}: {
  variant: ComposerVariant;
  plusMenuOpen: boolean;
  setPlusMenuOpen: (open: boolean) => void;
  enableThinking: boolean;
  onClearThinking: () => void;
  enableGeneral: boolean;
  onClearGeneral: () => void;
  handleVoiceToggle: () => void;
  isListening: boolean;
  onSend: () => void;
  onStop: () => void;
  sendDisabled: boolean;
  isLoading: boolean;
  t: (key: string) => string;
  showPlusMenu?: boolean;
  showMic?: boolean;
}) {
  const sq =
    variant === "welcome" ? "h-9 w-9 rounded-xl" : "h-9 w-9 rounded-lg";
  const plusBase =
    "bg-muted text-foreground border-border hover:bg-muted/80 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600";
  const sendRound = variant === "welcome" ? "rounded-xl" : "rounded-lg";

  return (
    <div className="flex items-center gap-1.5 px-2 pb-2 pt-1 sm:gap-2 sm:px-3">
      {showPlusMenu && (
        <button
          type="button"
          onClick={() => setPlusMenuOpen(!plusMenuOpen)}
          className={`inline-flex ${sq} shrink-0 items-center justify-center border transition-colors ${plusBase} ${
            plusMenuOpen ? "ring-2 ring-vidya-400/50 border-vidya-300 dark:border-vidya-600" : ""
          }`}
          aria-expanded={plusMenuOpen}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
      {enableThinking ? (
        <ThinkingModeChip variant={variant} onRemove={onClearThinking} t={t} />
      ) : enableGeneral ? (
        <GeneralModeChip variant={variant} onRemove={onClearGeneral} t={t} />
      ) : null}
      {showMic && (
        <button
          type="button"
          onClick={handleVoiceToggle}
          className={`inline-flex ${sq} shrink-0 items-center justify-center border transition-colors ${
            isListening
              ? "bg-red-500 text-white border-red-600 animate-pulse"
              : plusBase
          }`}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
      <div className="min-w-2 flex-1" aria-hidden />
      <button
        type="button"
        onClick={isLoading ? onStop : onSend}
        disabled={!isLoading && sendDisabled}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-vidya-500 to-vidya-700 text-white shadow-md hover:from-vidya-600 hover:to-vidya-800 disabled:opacity-50 transition-all ${sendRound}`}
      >
        {isLoading ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
