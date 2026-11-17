"use client";

import { useCallback, useState } from "react";
import { ChatDiagramCanvas } from "@/components/chat/ChatDiagramCanvas";

type Props = {
  chart: string;
  title?: string;
  titleFallback: string;
  compact?: boolean;
};

/**
 * Concept map (Mermaid) for chat: interactive canvas with pan/zoom and study labels.
 */
export function HomeRelatedDiagram({
  chart,
  title,
  titleFallback,
  compact = false,
}: Props) {
  const trimmed = (chart || "").trim();
  const [show, setShow] = useState(true);

  const onRenderResult = useCallback((ok: boolean) => {
    if (!ok) setShow(false);
  }, []);

  if (!trimmed || !show) {
    return null;
  }

  return (
    <ChatDiagramCanvas
      chart={trimmed}
      title={title}
      titleFallback={titleFallback}
      compact={compact}
      onRenderResult={onRenderResult}
    />
  );
}
