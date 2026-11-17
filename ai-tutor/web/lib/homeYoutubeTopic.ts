/**
 * Build a short, topic-style string for YouTube search from chat context.
 * Generic “try asking” pills are not real topics — use assistant/RAG/PDF instead.
 */

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Full try-ask strings (en + hi) — match start or near-start after normalize. */
const GENERIC_STUDY_PROMPTS: string[] = [
  "Explain this chapter with colorful notes, real-life examples, and visual learning blocks.",
  "Test my understanding of this chapter with a quiz.",
  "Create exam-ready revision notes for this chapter.",
  "Ask me NCERT competency-based questions from this chapter.",
  "Create a detailed mind map for this chapter.",
  "Revise this chapter in 5 minutes with key points.",
  "Explain this chapter with diagrams and flowcharts.",
  "Help me solve NCERT textbook questions from this chapter.",
  "Conduct a full chapter test on this chapter.",
  "Explain the difficult concepts in this chapter in simple language I can easily understand.",
  "Generate smart study notes for this chapter with key definitions, NCERT highlights, and quick revision points.",
  "Explain this chapter as an engaging story that makes it easy to remember.",
  "इस अध्याय को रंगीन नोट्स, वास्तविक जीवन के उदाहरणों और दृश्य शिक्षण ब्लॉक के साथ समझाइए।",
  "इस अध्याय पर एक प्रश्नोत्तरी देकर मेरी समझ परखें।",
  "इस अध्याय के लिए परीक्षा-तैयार पुनरावृत्ति नोट्स बनाइए।",
  "इस अध्याय से NCERT दक्षता-आधारित प्रश्न पूछिए।",
  "इस अध्याय के लिए एक विस्तृत माइंड मैप बनाइए।",
  "इस अध्याय को 5 मिनट में मुख्य बिंदुओं के साथ दोहराइए।",
  "इस अध्याय को आरेख और फ्लोचार्ट के साथ समझाइए।",
  "इस अध्याय के NCERT पाठ्यपुस्तक प्रश्नों को हल करने में मेरी मदद करें।",
  "इस अध्याय पर एक पूर्ण परीक्षा आयोजित करें।",
  "इस अध्याय की कठिन अवधारणाओं को सरल भाषा में समझाइए।",
  "इस अध्याय के लिए स्मार्ट अध्ययन नोट्स बनाइए जिसमें मुख्य परिभाषाएँ, NCERT मुख्य बिंदु और त्वरित पुनरावृत्ति हो।",
  "इस अध्याय को एक रोचक कहानी के रूप में समझाइए जिसे आसानी से याद किया जा सके।",
];

export function isGenericStudyPrompt(message: string): boolean {
  const t = normalizeWs(message);
  if (t.length < 24) return false;
  for (const g of GENERIC_STUDY_PROMPTS) {
    const ng = normalizeWs(g);
    if (t === ng || t.startsWith(ng.slice(0, Math.min(40, ng.length)))) return true;
  }
  const low = t.toLowerCase();
  if (low.startsWith("explain this chapter") && low.includes("colorful")) return true;
  if (low.startsWith("test my understanding") && low.includes("chapter")) return true;
  if (low.startsWith("create exam-ready revision notes")) return true;
  if (low.startsWith("ask me ncert competency-based questions")) return true;
  if (low.startsWith("create a detailed mind map")) return true;
  if (low.startsWith("revise this chapter in 5 minutes")) return true;
  if (low.startsWith("explain this chapter with diagrams")) return true;
  if (low.startsWith("help me solve ncert textbook questions")) return true;
  if (low.startsWith("conduct a full chapter test")) return true;
  if (low.startsWith("explain the difficult concepts in this chapter")) return true;
  if (low.startsWith("generate smart study notes for this chapter")) return true;
  if (low.startsWith("explain this chapter as an engaging story")) return true;
  if (t.includes("इस अध्याय को रंगीन नोट्स")) return true;
  if (t.includes("इस अध्याय पर एक प्रश्नोत्तरी")) return true;
  if (t.includes("परीक्षा-तैयार पुनरावृत्ति नोट्स")) return true;
  if (t.includes("NCERT दक्षता-आधारित प्रश्न")) return true;
  if (t.includes("विस्तृत माइंड मैप")) return true;
  if (t.includes("5 मिनट में मुख्य बिंदुओं")) return true;
  if (t.includes("आरेख और फ्लोचार्ट")) return true;
  if (t.includes("NCERT पाठ्यपुस्तक प्रश्नों")) return true;
  if (t.includes("पूर्ण परीक्षा आयोजित")) return true;
  if (t.includes("कठिन अवधारणाओं को सरल भाषा")) return true;
  if (t.includes("स्मार्ट अध्ययन नोट्स") && t.includes("अध्याय")) return true;
  if (t.includes("रोचक कहानी") && t.includes("अध्याय")) return true;
  return false;
}

function stripLightMarkdown(s: string): string {
  return s
    .replace(/\*+/g, "")
    .replace(/`+/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();
}

/**
 * Strip leading emoji / decoration characters so we can match the text content.
 * e.g. "🎯 मूल सारांश" → "मूल सारांश"
 * Uses explicit Unicode ranges (same set as the Python backend sanitizer).
 */
function stripLeadingDecoration(s: string): string {
  let t = s;
  let prev: string;
  do {
    prev = t;
    // Remove: whitespace, variation selectors, ZWJ, misc symbols (U+2600-27BF),
    // and supplementary emoji planes (U+1F000-U+1FADF via surrogate pairs in JS).
    t = t.replace(/^[\s\uFE0F\u200D\u2600-\u27BF]/, "")
         .replace(/^[\uD83C-\uDBFF][\uDC00-\uDFFF]/, "") // surrogate pair emoji
         .trimStart();
  } while (t !== prev);
  return t.trim();
}

/** Generic Hindi section labels that appear as headings but are not real chapter topics. */
const HINDI_NOISE_PREFIXES: readonly string[] = [
  "मूल सारांश",
  "सारांश",
  "संक्षिप्त सारांश",
  "संक्षेप",
  "मुख्य बिंदु",
  "महत्वपूर्ण बिंदु",
  "मुख्य तथ्य",
  "मुख्य अवधारणाए",   // covers मुख्य अवधारणाएं / अवधारणाएँ
  "परिचय",
  "निष्कर्ष",
  "अध्याय सारांश",
  "याद रखें",
  "ध्यान दें",
  "अभ्यास प्रश्न",
  "महत्वपूर्ण परिभाषाए", // covers परिभाषाएं / परिभाषाएँ
  "महत्वपूर्ण सूत्र",
  "अध्याय समीक्षा",
];

function looksLikeNoiseTitle(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return true;
  const low = t.toLowerCase();
  if (/^(here|below|sure|introduction|overview|summary|answer|note)[\s:]/i.test(low))
    return true;
  if (/^in this (chapter|section)/i.test(low)) return true;
  // Assistant templates — not real chapter titles
  if (/\bchapter overview\b/i.test(low)) return true;

  // Strip leading emoji/decoration before checking Hindi noise labels
  const plain = stripLeadingDecoration(t);
  for (const prefix of HINDI_NOISE_PREFIXES) {
    if (plain === prefix || plain.startsWith(prefix + " ") || plain.startsWith(prefix + ":"))
      return true;
  }
  return false;
}

/** First meaningful markdown heading, chapter line, bold title, or early **Topic** span.
 *
 * Iterates ALL headings (h1–h4) so generic section labels like "मूल सारांश" or
 * "मुख्य बिंदु" are skipped and the first real topic heading is returned instead.
 */
export function extractTopicFromAssistant(markdown: string): string {
  const slice = (markdown || "").slice(0, 14000);

  // Walk every h1-h4 heading; return the first one that isn't a noise section label.
  for (const m of slice.matchAll(/(?:^|\n)#{1,4}\s+([^\n]+)/g)) {
    if (m[1]) {
      const cand = stripLightMarkdown(m[1]);
      if (cand.length >= 4 && !looksLikeNoiseTitle(cand)) return normalizeWs(cand);
    }
  }

  const chapter = slice.match(
    /(?:Chapter|CHAPTER|अध्याय|चैप्टर)\s*\d+\s*[.:、\s-–—]*\s*([^\n.!।]+)/i,
  );
  if (chapter?.[1]) {
    const cand = stripLightMarkdown(chapter[1]);
    if (cand.length >= 4 && !looksLikeNoiseTitle(cand)) return normalizeWs(cand);
  }

  const blockBold = slice.match(/(?:^|\n)\*\*([^*\n]{5,220})\*\*(?:\s*\n|$)/);
  if (blockBold?.[1]) {
    const cand = stripLightMarkdown(blockBold[1]);
    if (cand.length >= 4 && !looksLikeNoiseTitle(cand)) return normalizeWs(cand);
  }

  const early = slice.slice(0, 3200);
  const inlineBold = early.match(/\*\*([^*\n]{6,200})\*\*/);
  if (inlineBold?.[1]) {
    const cand = stripLightMarkdown(inlineBold[1]);
    if (cand.length >= 4 && !looksLikeNoiseTitle(cand)) return normalizeWs(cand);
  }

  return "";
}

/** English/Hinglish subject cues embedded in Hindi-heavy answers (YouTube titles are rarely Devanagari). */
export function extractEnglishSubjectLead(markdown: string): string {
  const slice = (markdown || "").slice(0, 8000);
  const plain = stripLightMarkdown(slice);

  const blockChem = plain.match(
    /\b[df][\s-]*block\s+elements?\s+of\s+Class\s+(\d{1,2})\s+Chemistry\b/i,
  );
  if (blockChem) {
    return normalizeWs(
      `Class ${blockChem[1]} Chemistry d-block f-block elements periodic table`,
    );
  }

  const clsSub = plain.match(
    /\bClass\s+(\d{1,2})\s+(Chemistry|Physics|Biology|Mathematics|Maths|Geography|History|Economics|Political Science|Science)\b/i,
  );
  if (clsSub) {
    return normalizeWs(`Class ${clsSub[1]} ${clsSub[2]}`);
  }

  const aboutChem = plain.match(
    /\b(?:this\s+chapter\s+is\s+about|chapter\s+(?:is\s+)?about)\s+([^.!\n]{10,220})(?:[.!]|$)/i,
  );
  if (aboutChem) {
    const bit = normalizeWs(aboutChem[1]);
    if (/\bchemistry\b/i.test(bit) && bit.length >= 12 && bit.length < 280) {
      return bit.length > 380 ? `${bit.slice(0, 377).trim()}…` : bit;
    }
  }

  return "";
}

export function filenameToReadableTopic(url?: string): string {
  if (!url?.trim()) return "";
  let name = "";
  try {
    name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "");
  } catch {
    return "";
  }
  name = name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  if (name.length < 4) return "";
  const compact = name.replace(/\s/g, "");
  if (/^[a-z]{0,5}\d{2,5}[a-z]?$/i.test(compact)) return "";
  return normalizeWs(name);
}

function assistantPlainLead(md: string, maxLen: number): string {
  let t = stripLightMarkdown(md)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, maxLen);
  t = t.replace(/\[[\d]+\]/g, "").trim();
  return t;
}

/**
 * PDF/source dropdown often stores only "Ch 1" / "अध्याय 1" — useless alone for YouTube search.
 * Skip so we infer topic from answer headings / user question instead.
 */
function isBareChapterSourceLabel(s: string): boolean {
  const t = normalizeWs(s);
  if (!t) return false;
  return /^(ch\.?|chapter|lesson|lec\.?|unit|अध्याय|चैप्टर|पाठ|भाग)\s*[0-9०-९]+\s*[a-z]?\s*$/iu.test(t);
}

/** Topic for /youtube-home — never prefer generic instructions over real chapter text. */
export function deriveHomeYoutubeTopic(input: {
  userMessage: string;
  assistantContent: string;
  pdfUrl?: string;
  ragSnippet?: string;
  imageTitle?: string;
  /** NCERT/Source dropdown chapter name — highest priority when set. */
  selectedSourceTitle?: string;
}): string {
  const srcTitle = normalizeWs(input.selectedSourceTitle || "").trim();
  const srcTitleMeaningful =
    srcTitle.length >= 4 &&
    !/^untitled$/i.test(srcTitle) &&
    !/^select source$/i.test(srcTitle) &&
    !isBareChapterSourceLabel(srcTitle);

  if (srcTitleMeaningful) {
    return clampTopic(srcTitle);
  }

  const fromAssist = extractTopicFromAssistant(input.assistantContent || "");
  const englishLead = extractEnglishSubjectLead(input.assistantContent || "");

  if (fromAssist && englishLead.length >= 8) {
    return clampTopic(`${englishLead} — ${fromAssist}`);
  }
  if (fromAssist) return clampTopic(fromAssist);
  if (englishLead.length >= 8) return clampTopic(englishLead);

  const img = normalizeWs(input.imageTitle || "").replace(/^concept\s*:\s*/i, "").trim();
  if (img.length >= 4 && !/^untitled$/i.test(img)) return clampTopic(img);

  const ragRaw = (input.ragSnippet || "").trim();
  if (ragRaw) {
    const lines = ragRaw.split(/\n/).map((l) => normalizeWs(l)).filter(Boolean);
    const candidate = lines.find(
      (l) => l.length >= 14 && l.length < 260 && !/^page\s+\d+/i.test(l),
    );
    if (candidate) return clampTopic(candidate.split(/[.।]/)[0] || candidate);
    const bit = ragRaw.slice(0, 400).split(/[.।\n]/)[0]?.trim();
    if (bit && bit.length >= 14) return clampTopic(bit);
  }

  const user = normalizeWs(input.userMessage || "");
  if (user && !isGenericStudyPrompt(user)) return clampTopic(user);

  const pdfTopic = filenameToReadableTopic(input.pdfUrl);
  if (pdfTopic) return clampTopic(pdfTopic);

  const plain = assistantPlainLead(input.assistantContent || "", 700);
  if (plain.length > 35) {
    const first = plain.split(/[.।]/).map((s) => normalizeWs(s)).find((s) => s.length > 35);
    if (first && !/^here\b/i.test(first)) return clampTopic(first);
  }

  if (user) return clampTopic(user);

  const fallback = plain.slice(0, 240);
  return clampTopic(fallback || "");
}

function clampTopic(s: string): string {
  const t = normalizeWs(s);
  if (!t) return "";
  return t.length > 380 ? `${t.slice(0, 377).trim()}…` : t;
}
