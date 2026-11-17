/** Delimiter between questions in a combined notebook record. */
export const NOTEBOOK_QUESTION_BOUNDARY = "<<<BIXY_QUESTION>>>";

/** Format one question block (markdown). */
export function formatQuestionOutput(question: {
  question?: string;
  options?: Record<string, string>;
  correct_answer?: string;
  explanation?: string;
}): string {
  const optionsText = question.options
    ? Object.entries(question.options)
        .map(([k, v]) => `${k}. ${v}`)
        .join("\n")
    : "N/A";

  return `**Question:**\n${question.question ?? ""}\n\n**Options:**\n${optionsText}\n\n**Correct Answer:** ${question.correct_answer ?? ""}\n\n**Explanation:**\n${question.explanation ?? ""}`;
}

export interface QuestionGenResult {
  question: {
    question?: string;
    type?: string;
    question_type?: string;
    options?: Record<string, string>;
    correct_answer?: string;
    explanation?: string;
  };
  rounds?: number;
  extended?: boolean;
}

export interface QuestionNotebookRecordInput {
  title: string;
  userQuery: string;
  output: string;
  metadata?: Record<string, unknown>;
}

/** Build a single notebook record containing every generated question. */
export function buildQuestionNotebookRecord(
  results: QuestionGenResult[],
  ctx: {
    topic: string;
    difficulty: string;
    type: string;
    selectedKb: string;
  },
): QuestionNotebookRecordInput | null {
  if (results.length === 0) return null;

  const userQuery = `Topic: ${ctx.topic}\nDifficulty: ${ctx.difficulty}\nType: ${ctx.type}\nCount: ${results.length} question(s)`;
  const qType =
    results[0]?.question?.type ||
    results[0]?.question?.question_type ||
    ctx.type;

  const blocks = results.map((result, index) => {
    const header = `## Question ${index + 1}${result.extended ? " (Extended)" : ""}`;
    return `${header}\n\n${formatQuestionOutput(result.question)}`;
  });

  const output = [
    `# ${ctx.topic}`,
    "",
    userQuery.replace(/\n/g, " · "),
    "",
    blocks.join(`\n\n${NOTEBOOK_QUESTION_BOUNDARY}\n\n`),
  ].join("\n");

  const title =
    results.length === 1
      ? `${ctx.topic} - (${qType})`
      : `${ctx.topic} (${results.length} questions)`;

  return {
    title,
    userQuery,
    output,
    metadata: {
      difficulty: ctx.difficulty,
      question_type: ctx.type,
      question_count: results.length,
      kb_name: ctx.selectedKb,
      topic: ctx.topic,
      questions: results.map((r, i) => ({
        index: i + 1,
        extended: r.extended,
        rounds: r.rounds,
        question: r.question,
      })),
    },
  };
}

export interface QuestionLoadFromNotebook {
  topic: string;
  difficulty: string;
  type: string;
  count: number;
  selectedKb: string;
  results: QuestionGenResult[];
  mode: "knowledge" | "mimic";
}

export function parseUserQueryFields(userQuery: string): {
  topic: string;
  difficulty: string;
  type: string;
  count: number;
} {
  const topic = userQuery.match(/^Topic:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const difficulty =
    userQuery.match(/^Difficulty:\s*(.+)$/m)?.[1]?.trim() || "medium";
  const type = userQuery.match(/^Type:\s*(.+)$/m)?.[1]?.trim() || "choice";
  const countMatch = userQuery.match(/^Count:\s*(\d+)/m);
  const count = countMatch ? parseInt(countMatch[1], 10) : 0;
  return { topic, difficulty, type, count };
}

export function resultsFromNotebookMetadata(
  metadata: Record<string, unknown> | undefined,
): QuestionGenResult[] {
  const questions = metadata?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const mapped: (QuestionGenResult | null)[] = questions.map((item: unknown) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const q = (row.question ?? row) as QuestionGenResult["question"];
    if (!q || typeof q !== "object") return null;
    return {
      question: q,
      extended: Boolean(row.extended),
      rounds: typeof row.rounds === "number" ? row.rounds : 1,
    } satisfies QuestionGenResult;
  });
  return mapped.filter((r): r is QuestionGenResult => r !== null);
}

function parseOptionsBlock(text: string): Record<string, string> {
  const options: Record<string, string> = {};
  const trimmed = text.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return options;
  for (const line of trimmed.split("\n")) {
    const m = line.match(/^([A-Za-z0-9]+)\.\s*(.+)$/);
    if (m) options[m[1]] = m[2].trim();
  }
  return options;
}

function parseQuestionBlock(block: string): QuestionGenResult | null {
  const extended = /\(Extended\)/i.test(block);
  const questionMatch = block.match(
    /\*\*Question:\*\*\s*\n([\s\S]*?)(?=\n\n\*\*Options:\*\*|\n\*\*Options:\*\*)/,
  );
  const optionsMatch = block.match(
    /\*\*Options:\*\*\s*\n([\s\S]*?)(?=\n\n\*\*Correct Answer:\*\*|\n\*\*Correct Answer:\*\*)/,
  );
  const answerMatch = block.match(
    /\*\*Correct Answer:\*\*\s*([\s\S]*?)(?=\n\n\*\*Explanation:\*\*|\n\*\*Explanation:\*\*|$)/,
  );
  const explanationMatch = block.match(/\*\*Explanation:\*\*\s*\n([\s\S]*)$/);

  const questionText = questionMatch?.[1]?.trim();
  if (!questionText) return null;

  return {
    question: {
      question: questionText,
      options: optionsMatch ? parseOptionsBlock(optionsMatch[1]) : {},
      correct_answer: answerMatch?.[1]?.trim() ?? "",
      explanation: explanationMatch?.[1]?.trim() ?? "",
    },
    extended,
    rounds: 1,
  };
}

export function resultsFromNotebookOutput(output: string): QuestionGenResult[] {
  if (!output.trim()) return [];

  let chunks: string[] = [];
  if (output.includes(NOTEBOOK_QUESTION_BOUNDARY)) {
    chunks = output.split(NOTEBOOK_QUESTION_BOUNDARY);
  } else {
    const parts = output.split(/(?=##\s*Question\s+\d+)/i);
    chunks = parts.length > 1 ? parts.slice(1) : [output];
  }

  const results: QuestionGenResult[] = [];
  for (const chunk of chunks) {
    const parsed = parseQuestionBlock(chunk);
    if (parsed) results.push(parsed);
  }
  return results;
}

/** Restore Question Generator state from a saved notebook record. */
export function parseNotebookRecordToQuestionLoad(record: {
  user_query: string;
  output: string;
  metadata?: Record<string, unknown>;
  kb_name?: string;
}): QuestionLoadFromNotebook | null {
  let results = resultsFromNotebookMetadata(record.metadata);
  if (results.length === 0) {
    results = resultsFromNotebookOutput(record.output);
  }
  if (results.length === 0) return null;

  const fields = parseUserQueryFields(record.user_query);
  const meta = record.metadata ?? {};
  const topic =
    fields.topic ||
    (typeof meta.topic === "string" ? meta.topic : "") ||
    record.user_query.split("\n")[0]?.trim() ||
    "Saved questions";
  const difficulty =
    (typeof meta.difficulty === "string" ? meta.difficulty : "") ||
    fields.difficulty;
  const type =
    (typeof meta.question_type === "string" ? meta.question_type : "") ||
    fields.type;
  const count =
    (typeof meta.question_count === "number" ? meta.question_count : 0) ||
    fields.count ||
    results.length;
  const selectedKb =
    (typeof meta.kb_name === "string" ? meta.kb_name : "") ||
    record.kb_name ||
    "";

  return {
    topic,
    difficulty,
    type,
    count: count || results.length,
    selectedKb,
    results,
    mode: "knowledge",
  };
}
