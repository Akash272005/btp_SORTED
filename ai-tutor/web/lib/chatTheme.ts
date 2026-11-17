/** Shared chat UI tokens aligned with Vidya brand + CSS variables. */
export const chatTheme = {
  surface: "bg-background dark:bg-slate-950",
  headerBar:
    "border-b border-border bg-background/90 dark:bg-slate-900/90 backdrop-blur-sm",
  composerBar:
    "shrink-0 border-t border-border bg-background dark:bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
  composerShell:
    "rounded-xl border border-border bg-muted/50 dark:bg-slate-800/80 shadow-sm",
  welcomeComposerShell:
    "rounded-2xl border border-border/80 bg-card dark:bg-slate-800 shadow-lg",
  userBubble:
    "bg-vidya-600 text-white shadow-md shadow-vidya-600/25 font-medium",
  avatar:
    "bg-gradient-to-br from-vidya-500 to-vidya-700 shadow-sm shadow-vidya-600/20",
  sendBtn:
    "bg-gradient-to-br from-vidya-500 to-vidya-700 text-white shadow-md hover:from-vidya-600 hover:to-vidya-800 disabled:opacity-50",
  accentText: "text-vidya-600 dark:text-vidya-400",
  accentHover:
    "hover:text-vidya-600 dark:hover:text-vidya-400 hover:bg-vidya-50 dark:hover:bg-vidya-950/40",
  thinkingPanel:
    "rounded-2xl bg-slate-700 dark:bg-slate-800 border border-slate-600/40 shadow-inner",
  sourceActive:
    "border-vidya-300 bg-vidya-50 text-vidya-800 dark:border-vidya-600 dark:bg-vidya-900/40 dark:text-vidya-200",
  sourceIdle:
    "border-border bg-card text-foreground hover:bg-muted dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  welcomeGradient:
    "bg-gradient-to-r from-vidya-600 via-vidya-500 to-vidya-700 dark:from-vidya-400 dark:via-vidya-300 dark:to-vidya-500",
  glowGradient:
    "bg-gradient-to-r from-vidya-500 via-vidya-400 to-vidya-600",
  toast: {
    success:
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-200/80 dark:border-emerald-800",
    error:
      "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 border border-red-200/80 dark:border-red-800",
    info: "bg-muted text-muted-foreground border border-border",
  },
} as const;
