import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";
import { exportToPdf } from "@/lib/pdfExport";

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function htmlToParagraphs(html: string, title: string): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
  ];

  const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
  if (!parser) {
    const plain = stripTags(html);
    plain.split(/\n+/).forEach((line) => {
      if (line.trim()) out.push(new Paragraph({ children: [new TextRun(line)] }));
    });
    return out;
  }

  const doc = parser.parseFromString(html || "<p></p>", "text/html");
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) out.push(new Paragraph({ children: [new TextRun(t)] }));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || "";
    if (!text && !["ul", "ol"].includes(tag)) return;

    if (tag === "h1") {
      out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1 }));
    } else if (tag === "h2") {
      out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2 }));
    } else if (tag === "h3") {
      out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3 }));
    } else if (tag === "li") {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${text}` })],
          indent: { left: 720 },
        }),
      );
    } else if (tag === "p" || tag === "mark") {
      const runs: TextRun[] = [];
      el.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && child.textContent) {
          runs.push(new TextRun(child.textContent));
        } else if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as HTMLElement).tagName.toLowerCase() === "mark"
        ) {
          runs.push(
            new TextRun({
              text: child.textContent || "",
              highlight: "yellow",
            }),
          );
        } else if (child.textContent) {
          runs.push(new TextRun(child.textContent));
        }
      });
      if (runs.length) out.push(new Paragraph({ children: runs }));
      else if (text) out.push(new Paragraph({ children: [new TextRun(text)] }));
    } else if (tag === "ul" || tag === "ol") {
      el.querySelectorAll("li").forEach((li) => walk(li));
    } else {
      el.childNodes.forEach(walk);
    }
  };

  doc.body.childNodes.forEach(walk);
  if (out.length === 1) {
    out.push(new Paragraph({ children: [new TextRun(stripTags(html) || "")] }));
  }
  return out;
}

/** Build a standalone DOM tree for PDF capture (avoids cloning TipTap / dark-mode UI). */
export function buildNotePdfElement(
  title: string,
  contentHtml: string,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "note-pdf-export-root";
  root.style.cssText = [
    "width:800px",
    "min-height:120px",
    "padding:32px",
    "box-sizing:border-box",
    "background:#ffffff",
    "color:#0f172a",
    "font-family:system-ui,-apple-system,sans-serif",
  ].join(";");

  const heading = document.createElement("h1");
  heading.textContent = title || "Untitled note";
  heading.style.cssText =
    "margin:0 0 20px;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;";

  const body = document.createElement("div");
  body.innerHTML = contentHtml?.trim() ? contentHtml : "<p></p>";
  body.style.cssText =
    "font-size:14px;line-height:1.65;color:#0f172a;word-wrap:break-word;";
  body.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.style.color = "#0f172a";
    if (el.tagName === "MARK") {
      el.style.backgroundColor = "#fef08a";
    }
    if (el.tagName === "H1") el.style.fontSize = "20px";
    if (el.tagName === "H2") el.style.fontSize = "18px";
    if (el.tagName === "H3") el.style.fontSize = "16px";
  });

  root.appendChild(heading);
  root.appendChild(body);
  return root;
}

export async function exportNoteToPdf(
  title: string,
  contentHtml: string,
): Promise<void> {
  const element = buildNotePdfElement(title, contentHtml);
  const filename = (title || "note").replace(/[^a-zA-Z0-9]/g, "_");
  await exportToPdf(element, { filename, scale: 2 });
}

export async function exportNoteToDocx(
  title: string,
  contentHtml: string,
): Promise<void> {
  const paragraphs = htmlToParagraphs(contentHtml, title);
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const filename = `${(title || "note").replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
  saveAs(blob, filename);
}
