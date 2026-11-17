/** Extract visible node labels from a Mermaid flowchart for study hints. */
export function extractMermaidLabels(chart: string): string[] {
  const labels = new Set<string>();
  const patterns = [
    /\["([^"]+)"\]/g,
    /\['([^']+)'\]/g,
    /\(([^)]+)\)/g,
    /\[([^\[\]"']+)\]/g,
    /-->\s*\|([^|]+)\|\s*/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    while ((m = copy.exec(chart)) !== null) {
      const raw = (m[1] || "").trim();
      if (
        raw.length > 1 &&
        raw.length < 120 &&
        !/^(flowchart|graph|subgraph|style|classDef|click|TD|LR|TB|BT|RL)$/i.test(
          raw,
        ) &&
        !/^[A-Za-z0-9_]+$/.test(raw)
      ) {
        labels.add(raw.replace(/<br\s*\/?>/gi, " "));
      }
    }
  }
  return Array.from(labels).slice(0, 12);
}

/** Pull ```mermaid fenced blocks from assistant markdown. */
export function extractMermaidBlocksFromMarkdown(content: string): string[] {
  const blocks: string[] = [];
  const re = /```mermaid\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const src = (m[1] || "").trim();
    if (src) blocks.push(src);
  }
  return blocks;
}
