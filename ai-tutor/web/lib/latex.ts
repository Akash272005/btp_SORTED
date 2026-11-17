/**
 * Utility functions for LaTeX processing.
 *
 * remark-math only supports $...$ and $$...$$ delimiters by default.
 * Many LLMs output LaTeX using:
 *   - \(...\) and \[...\] delimiters
 *   - A lone "$" on its own line as a block math wrapper
 * This utility normalises all formats to $...$ / $$...$$ for remark-math.
 */
function convertLoneDollarBlocks(content: string): string {
  // Pad so every lone-$ is surrounded by newlines.
  let s = "\n" + content + "\n";

  // Loop to handle adjacent blocks (regex is non-overlapping by default).
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(
      /\n[ \t\r]*\$[ \t\r]*\n([\s\S]*?)\n[ \t\r]*\$[ \t\r]*\n/g,
      (_m, inner) => "\n$$\n" + inner.trim() + "\n$$\n",
    );
  }

  // Remove the sentinel padding.
  return s.slice(1, -1);
}

/**
 * Convert LaTeX delimiters from \(...\) and \[...\] to $...$ and $$...$$.
 *
 * @param content - The content containing LaTeX delimiters
 * @returns Content with $...$ and $$...$$ delimiters only
 */
export function convertLatexDelimiters(content: string): string {
  if (!content) return content;

  let result = content;

  // Step 1: Convert lone-$ block pattern FIRST (before any $ is treated as inline)
  result = convertLoneDollarBlocks(result);

  // Step 2: Convert \[...\] to $$...$$ (block math)
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => "\n$$\n" + inner + "\n$$\n");

  // Step 3: Convert \(...\) to $...$ (inline math)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);

  // Step 4: Clean up excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}
/**
 * LLMs often emit "display" math with `$` alone on a line, e.g.
 */
export function normalizeMultilineDollarMath(content: string): string {
  if (!content) return content;

  return content.replace(
    /(?:^|\r?\n)([ \t]*\$[ \t]*)\r?\n([\s\S]*?)\r?\n([ \t]*\$[ \t]*)(?=\r?\n|$)/g,
    (_match, _open, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return _match;
      return `\n$$\n${trimmed}\n$$\n`;
    },
  );
}

/**
 * Process content for ReactMarkdown rendering with proper LaTeX support.
 * Convenience wrapper that applies all necessary transformations.
 *
 * @param content - The raw content to process
 * @returns Processed content ready for ReactMarkdown with remark-math
 */
export function processLatexContent(content: string): string {
  if (!content) return "";

  // Convert to string if not already.
  const str = String(content);
  let out = normalizeMultilineDollarMath(str);
  out = convertLatexDelimiters(out);
  return out;
}
