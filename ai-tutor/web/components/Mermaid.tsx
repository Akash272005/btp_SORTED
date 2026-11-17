"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

interface MermaidProps {
  chart: string;
  className?: string;
  /** When set, failures call `false` and skip the red error box (for collapsible parents). */
  onRenderResult?: (success: boolean) => void;
}

type MermaidApi = typeof import("mermaid").default;

let mermaidInitPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: "basis",
        },
        themeVariables: {
          primaryColor: "#6366f1",
          primaryTextColor: "#1e293b",
          primaryBorderColor: "#c7d2fe",
          lineColor: "#94a3b8",
          secondaryColor: "#f1f5f9",
          tertiaryColor: "#f8fafc",
        },
      });
      return mermaid;
    });
  }
  return mermaidInitPromise;
}

let mermaidIdCounter = 0;

export const Mermaid: React.FC<MermaidProps> = ({
  chart,
  className = "",
  onRenderResult,
}) => {
  const { t } = useTranslation();
  const onRenderResultRef = useRef(onRenderResult);
  onRenderResultRef.current = onRenderResult;

  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">(() =>
    (chart || "").trim() ? "loading" : "idle",
  );
  const [id] = useState(() => `mermaid-${++mermaidIdCounter}`);

  useEffect(() => {
    let cancelled = false;

    const renderChart = async () => {
      const cleanedChart = (chart || "").trim();
      if (!cleanedChart) {
        setSvg("");
        setError(null);
        setPhase("idle");
        onRenderResultRef.current?.(false);
        return;
      }

      setPhase("loading");
      setSvg("");
      setError(null);

      try {
        const mermaid = await loadMermaid();
        // mermaid.render does not need a mounted container — only a unique id.
        const { svg: renderedSvg } = await mermaid.render(id, cleanedChart);
        if (cancelled) return;

        if (!renderedSvg?.trim()) {
          const msg = "Diagram produced no output";
          console.warn("Mermaid rendering:", msg);
          setError(msg);
          onRenderResultRef.current?.(false);
          setPhase("idle");
          return;
        }

        setSvg(renderedSvg);
        setError(null);
        setPhase("ready");
        onRenderResultRef.current?.(true);
      } catch (err) {
        if (cancelled) return;
        console.error("Mermaid rendering error:", err);
        const msg =
          err instanceof Error ? err.message : "Failed to render diagram";
        setError(msg);
        onRenderResultRef.current?.(false);
        setPhase("idle");
      }
    };

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error && onRenderResult) {
    return null;
  }

  if (error) {
    return (
      <div
        className={`my-4 p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}
      >
        <p className="text-red-600 text-sm font-medium mb-2">
          {t("Diagram rendering error")}
        </p>
        <pre className="text-xs text-red-500 whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer">
            {t("Show source")}
          </summary>
          <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div
        className={`my-6 flex justify-center items-center gap-2 text-slate-500 dark:text-slate-400 ${className}`}
      >
        <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
        <span className="text-sm">{t("Loading diagram")}</span>
      </div>
    );
  }

  if (phase === "ready" && svg) {
    return (
      <div
        className={`my-6 flex justify-center overflow-x-auto ${className}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return null;
};

export default Mermaid;
