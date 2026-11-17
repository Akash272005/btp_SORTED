import { apiUrl } from "@/lib/api";
import { authHeaders, useAuthStore } from "@/store/authStore";
import type { StudentDashboard } from "@/types/lms";

export type AssignmentItem = {
  id: string;
  title: string;
  teacher_name: string;
  subject?: string | null;
  marks: number;
  duration_mins: number;
  due_at: string;
  due_label: string;
  attempts_used: number;
  max_attempts: number;
  can_attempt: boolean;
  status: string;
  quiz_id?: string | null;
  instructions?: string | null;
  last_score?: number | null;
  last_max_score?: number | null;
  last_percentage?: number | null;
  student_count?: number;
  submitted_count?: number;
};

export type GenerateFromNcertResult = {
  success: boolean;
  questions: Array<Record<string, unknown>>;
  requested: number;
  completed: number;
  failed?: number;
  duration_secs?: number | null;
  stage_times?: Record<string, number> | null;
  error?: string | null;
  suggested_title?: string | null;
};

export type AssignmentResult = {
  assignment_id: string;
  title: string;
  attempt_id?: number | null;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  feedback: Record<string, string>;
  answers: Array<Record<string, unknown>>;
  questions: Array<Record<string, unknown>>;
  attempt_number: number;
  completed_at?: string | null;
  time_taken_mins?: number | null;
};

export type QuizOut = {
  id: string;
  teacher_id: number;
  title: string;
  subject: string;
  status: string;
  duration_mins: number;
  total_marks: number;
  questions?: Array<Record<string, unknown>>;
  ncert_class?: string | null;
  chapter_label?: string | null;
  kb_name?: string | null;
  pdf_url?: string | null;
  created_at?: string | null;
};

export type PaperOut = {
  id: number;
  teacher_id: number;
  title: string;
  subject?: string | null;
  board: string;
  exam_type?: string | null;
  ncert_class?: string | null;
  chapter_scope?: Record<string, unknown> | null;
  blueprint?: Record<string, unknown> | null;
  sections?: Record<string, unknown> | null;
  total_marks: number;
  duration_mins: number;
  instructions?: string | null;
  pdf_storage_key?: string | null;
  status: "draft" | "published" | string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PaperDistributionOut = {
  id: string;
  paper_id: number;
  teacher_id: number;
  class_id: string;
  title: string;
  due_at: string;
  instructions?: string | null;
  allow_download: boolean;
  allow_online_practice: boolean;
  allow_online_exam?: boolean;
  allow_written_submission?: boolean;
  created_at: string;
  due_label: string;
  pending_grade_count?: number;
};

export type PaperDistributionStudentRow = {
  student_id: number;
  full_name: string;
  roll_no?: string | null;
  viewed: boolean;
  downloaded: boolean;
  practice_started: boolean;
  practice_submitted: boolean;
  exam_submitted?: boolean;
  written_submitted?: boolean;
  written_submission_id?: string | null;
  attempt_id?: string | null;
  practice_attempt_id?: string | null;
  score?: number | null;
  max_score?: number | null;
  ai_score?: number | null;
  teacher_score?: number | null;
  grading_status?: string | null;
  progress_label?: string;
  last_event_at?: string | null;
};

export type PaperDistributionSummary = {
  student_count: number;
  viewed_count: number;
  downloaded_count: number;
  submitted_count: number;
  graded_count: number;
  pending_grade_count: number;
  distribution_mode: string;
  distribution_mode_label: string;
};

export type PaperDistributionDetail = {
  distribution: PaperDistributionOut;
  students: PaperDistributionStudentRow[];
  summary: PaperDistributionSummary;
};

export type StudentPaperItem = {
  distribution_id: string;
  paper_id: number;
  title: string;
  subject?: string | null;
  board: string;
  exam_type?: string | null;
  total_marks: number;
  duration_mins: number;
  due_at: string;
  due_label: string;
  status: "new" | "downloaded" | "overdue" | "completed";
  allow_download: boolean;
  allow_online_practice: boolean;
  allow_online_exam?: boolean;
  allow_written_submission?: boolean;
  submission_mode?: string;
  submission_mode_label?: string;
  progress_label?: string;
  chapter_label?: string | null;
  teacher_name?: string | null;
  last_score?: number | null;
  last_max_score?: number | null;
  last_percentage?: number | null;
};

export type StudentPaperListTab = "pending" | "submitted" | "overdue" | "all";

export type StudentPaperDetail = {
  distribution_id: string;
  paper_id: number;
  title: string;
  subject?: string | null;
  board: string;
  exam_type?: string | null;
  total_marks: number;
  duration_mins: number;
  due_at: string;
  due_label: string;
  allow_download: boolean;
  allow_online_practice: boolean;
  allow_online_exam?: boolean;
  allow_written_submission?: boolean;
  instructions?: string | null;
  sections?: Record<string, unknown> | null;
  chapter_scope?: Record<string, unknown> | null;
  has_downloaded?: boolean;
  written_status?: "not_started" | "submitted" | "graded";
  progress_label?: string | null;
};

export type PaperWrittenFile = {
  url: string;
  filename: string;
  uploaded_at?: string | null;
};

export type PaperWrittenStatus = {
  submission_id?: string | null;
  status: "not_started" | "draft" | "submitted" | "graded";
  files: PaperWrittenFile[];
  teacher_score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  submitted_at?: string | null;
};

export type PaperWrittenResult = {
  submission_id: string;
  distribution_id: string;
  teacher_score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  status: string;
  items: PaperExamGradeItem[];
  files: PaperWrittenFile[];
  submitted_at?: string | null;
  graded_at?: string | null;
};

export type TeacherWrittenSubmissionDetail = {
  submission_id: string;
  distribution_id: string;
  distribution_title: string;
  student_id: number;
  student_name: string;
  teacher_score?: number | null;
  max_score?: number | null;
  status: string;
  submitted_at?: string | null;
  graded_at?: string | null;
  files: PaperWrittenFile[];
  items: PaperExamGradeItem[];
};

export type PaperExamQuestion = {
  id: string;
  text: string;
  type?: string;
  marks?: number;
  options?: string[];
  section_id?: string;
};

export type PaperExamGradeItem = {
  question_id: string;
  section_id?: string;
  type?: string;
  question_text?: string;
  max_marks?: number;
  student_answer?: string;
  correct_answer?: string | null;
  ai_marks?: number;
  ai_feedback?: string;
  requires_teacher_review?: boolean;
  teacher_marks?: number | null;
  teacher_comment?: string | null;
  final_marks?: number;
};

export type PaperExamSubmitResult = {
  attempt_id: string;
  ai_score: number;
  max_score: number;
  percentage: number;
  grading_status: string;
  requires_teacher_review: boolean;
  items: PaperExamGradeItem[];
};

export type PaperExamResult = PaperExamSubmitResult & {
  distribution_id: string;
  teacher_score?: number | null;
  submitted_at?: string | null;
};

export type TeacherExamAttemptDetail = {
  attempt_id: string;
  distribution_id: string;
  distribution_title: string;
  student_id: number;
  student_name: string;
  ai_score?: number | null;
  teacher_score?: number | null;
  max_score?: number | null;
  grading_status?: string | null;
  submitted_at?: string | null;
  items: PaperExamGradeItem[];
};

export type PaperPracticeReviewItem = {
  question_id: string;
  section_id?: string | null;
  type?: string | null;
  question_text?: string | null;
  max_marks?: number | null;
  student_answer: string;
  correct_answer?: string | null;
  is_correct: boolean;
  marks_awarded?: number | null;
  feedback?: string | null;
};

export type TeacherPracticeAttemptDetail = {
  attempt_id: string;
  distribution_id: string;
  distribution_title: string;
  student_id: number;
  student_name: string;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  submitted_at?: string | null;
  items: PaperPracticeReviewItem[];
};

export type PaperPracticeStart = {
  attempt_id: string;
  distribution_id: string;
  paper_id: number;
  questions: Array<Record<string, unknown>>;
  duration_mins: number;
  started_at: string;
  saved_answers?: Array<{ question_id: string; answer: string }>;
};

export type PaperPracticeSubmitResult = {
  attempt_id: string;
  score: number;
  max_score: number;
  percentage: number;
  status: string;
  feedback: Record<string, string>;
};

export type AssignmentDetail = {
  assignment: AssignmentItem;
  questions: Array<Record<string, unknown>>;
  attempt_id?: number | null;
  in_progress: boolean;
};

export type AttemptStart = {
  attempt_id: number;
  assignment_id: string;
  quiz_id: string;
  attempt_number: number;
  questions: Array<Record<string, unknown>>;
  duration_mins: number;
  started_at: string;
  saved_answers?: Array<{ question_id: string; answer: string }>;
  marked_for_review?: string[];
};

export type AttemptSubmitResult = {
  attempt_id: number;
  score: number;
  max_score: number;
  percentage: number;
  status: string;
  feedback: Record<string, string>;
};

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(apiUrl(path), {
    ...options,
    cache: options.cache ?? "no-store",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(apiUrl(path), {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(token),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchStudentDashboard(): Promise<StudentDashboard> {
  return apiFetch<StudentDashboard>("/api/student/dashboard");
}

export async function fetchStudentAssignments(
  status?: "pending" | "submitted" | "overdue" | "all",
): Promise<AssignmentItem[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<AssignmentItem[]>(`/api/student/assignments${q}`);
}

export async function fetchAssignmentResult(
  assignmentId: string,
): Promise<AssignmentResult> {
  return apiFetch<AssignmentResult>(
    `/api/student/assignments/${assignmentId}/result`,
  );
}

export async function saveQuizAttemptDraft(
  assignmentId: string,
  answers: { question_id: string; answer: string }[],
  markedForReview: string[] = [],
): Promise<{ ok: boolean; attempt_id: number }> {
  return apiFetch(`/api/student/quizzes/${assignmentId}/draft`, {
    method: "PATCH",
    body: JSON.stringify({
      answers,
      marked_for_review: markedForReview,
    }),
  });
}

export async function generateQuizFromNcert(body: {
  chapter_label: string;
  subject: string;
  kb_name?: string;
  pdf_url?: string | null;
  count?: number;
  ncert_class?: string | null;
  title?: string | null;
}): Promise<GenerateFromNcertResult> {
  return apiFetch<GenerateFromNcertResult>(
    "/api/teacher/quizzes/generate-from-ncert",
    {
      method: "POST",
      body: JSON.stringify({
        count: 5,
        ...body,
      }),
    },
  );
}

export async function fetchPaperBlueprintPresets(): Promise<
  Record<string, Record<string, unknown>>
> {
  return apiFetch("/api/teacher/papers/blueprint-presets");
}

export async function fetchTeacherPapers(
  status?: "draft" | "published" | "all",
): Promise<PaperOut[]> {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PaperOut[]>(`/api/teacher/papers${q}`);
}

export async function fetchTeacherPaper(paperId: number): Promise<PaperOut> {
  return apiFetch<PaperOut>(`/api/teacher/papers/${paperId}`);
}

export type PaperDeleteResult = {
  deleted: boolean;
  paper_id: number;
  distributions_removed: number;
  events_removed: number;
  attempts_removed: number;
  written_removed: number;
};

export async function deleteTeacherPaper(paperId: number): Promise<PaperDeleteResult> {
  return apiFetch<PaperDeleteResult>(`/api/teacher/papers/${paperId}`, {
    method: "DELETE",
  });
}

export async function createTeacherPaper(body: {
  title: string;
  subject: string;
  board: string;
  exam_type:
    | "chapter_test"
    | "unit_test"
    | "half_yearly"
    | "annual"
    | "mcq_only"
    | "practice_worksheet";
  ncert_class?: string;
  chapter_scope?: Record<string, unknown>;
  blueprint?: Record<string, unknown>;
  sections?: Record<string, unknown>;
  total_marks: number;
  duration_mins: number;
  instructions?: string;
}): Promise<PaperOut> {
  return apiFetch<PaperOut>("/api/teacher/papers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTeacherPaper(
  paperId: number,
  body: Partial<{
    title: string;
    subject: string;
    board: string;
    exam_type:
      | "chapter_test"
      | "unit_test"
      | "half_yearly"
      | "annual"
      | "mcq_only"
      | "practice_worksheet";
    ncert_class: string;
    chapter_scope: Record<string, unknown>;
    blueprint: Record<string, unknown>;
    sections: Record<string, unknown>;
    total_marks: number;
    duration_mins: number;
    instructions: string;
    status: "draft" | "published";
  }>,
): Promise<PaperOut> {
  return apiFetch<PaperOut>(`/api/teacher/papers/${paperId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function publishTeacherPaper(paperId: number): Promise<PaperOut> {
  return apiFetch<PaperOut>(`/api/teacher/papers/${paperId}/publish`, {
    method: "POST",
  });
}

/** Build student question paper PDF (questions + marks, no answers). */
export async function generateTeacherQuestionPaperPdf(paperId: number): Promise<{
  paper_id: number;
  pdf_storage_key: string;
  regenerated: boolean;
}> {
  return apiFetch(`/api/teacher/papers/${paperId}/pdf/regenerate`, {
    method: "POST",
  });
}

/** @deprecated Use generateTeacherQuestionPaperPdf */
export const regenerateTeacherPaperPdf = generateTeacherQuestionPaperPdf;

export async function generateTeacherAnswerKeyPdf(paperId: number): Promise<{
  paper_id: number;
  pdf_storage_key: string;
  regenerated: boolean;
}> {
  return apiFetch(`/api/teacher/papers/${paperId}/answer-key/pdf`, {
    method: "POST",
  });
}

export async function fetchTeacherPaperAnswerKey(paperId: number): Promise<{
  paper_id: number;
  title: string;
  exam_type?: string | null;
  items: Array<Record<string, unknown>>;
}> {
  return apiFetch(`/api/teacher/papers/${paperId}/answer-key`);
}

export type PaperGenerateSlot = {
  section_id: string;
  section_type: string;
  count: number;
};

export type PaperGenerateBody = {
  chapter_label: string;
  subject: string;
  kb_name?: string;
  pdf_url?: string | null;
  count?: number;
  ncert_class?: string | null;
  exam_type?:
    | "chapter_test"
    | "unit_test"
    | "half_yearly"
    | "annual"
    | "mcq_only"
    | "practice_worksheet";
  section_id?: string;
  section_type?: "mcq" | "short" | "long" | string;
  /** Multi-section fill in one pipeline (shared research + plan). */
  slots?: PaperGenerateSlot[];
};

function paperGeneratePayload(body: PaperGenerateBody): Record<string, unknown> {
  return {
    count: 5,
    ...body,
  };
}

export type PaperStreamProgress = {
  type: "progress";
  stage: string;
  current: number;
  total: number;
};

export type PaperStreamQuestion = {
  type: "question";
  question: Record<string, unknown>;
  index: number;
  completed: number;
  requested: number;
};

export type PaperStreamDone = {
  type: "done";
  success: boolean;
  requested: number;
  completed: number;
  failed?: number;
  duration_secs?: number | null;
  stage_times?: Record<string, number> | null;
  error?: string | null;
  questions?: Array<Record<string, unknown>>;
};

export type PaperStreamEvent =
  | PaperStreamProgress
  | PaperStreamQuestion
  | PaperStreamDone
  | { type: "error"; message: string };

export async function generatePaperFromNcert(
  body: PaperGenerateBody,
): Promise<GenerateFromNcertResult> {
  return apiFetch<GenerateFromNcertResult>("/api/teacher/papers/generate-from-ncert", {
    method: "POST",
    body: JSON.stringify(paperGeneratePayload(body)),
  });
}

/** Same batch pipeline as generatePaperFromNcert; emits each question as it finishes. */
export async function streamPaperFromNcert(
  body: PaperGenerateBody,
  handlers: {
    onProgress?: (event: PaperStreamProgress) => void;
    onQuestion?: (event: PaperStreamQuestion) => void;
    onDone?: (event: PaperStreamDone) => void;
    onError?: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<GenerateFromNcertResult> {
  const token = useAuthStore.getState().token;
  const res = await fetch(apiUrl("/api/teacher/papers/generate-from-ncert/stream"), {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paperGeneratePayload(body)),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: unknown }).detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const streamState: { complete: PaperStreamDone | null } = { complete: null };

  const dispatch = (raw: PaperStreamEvent) => {
    if (raw.type === "progress") {
      handlers.onProgress?.(raw);
    } else if (raw.type === "question") {
      handlers.onQuestion?.(raw);
    } else if (raw.type === "done") {
      streamState.complete = raw;
      handlers.onDone?.(raw);
    } else if (raw.type === "error") {
      handlers.onError?.(raw.message);
    }
  };

  while (true) {
    const { done: streamEnded, value } = await reader.read();
    if (streamEnded) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      dispatch(JSON.parse(trimmed) as PaperStreamEvent);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    dispatch(JSON.parse(tail) as PaperStreamEvent);
  }

  const streamComplete = streamState.complete;
  if (!streamComplete) {
    throw new Error("Generation stream ended unexpectedly");
  }

  return {
    success: streamComplete.success,
    questions: streamComplete.questions ?? [],
    requested: streamComplete.requested,
    completed: streamComplete.completed,
    failed: streamComplete.failed,
    duration_secs: streamComplete.duration_secs,
    stage_times: streamComplete.stage_times,
    error: streamComplete.error,
  };
}

export async function fetchPaperDistributions(
  classId?: string,
): Promise<PaperDistributionOut[]> {
  const q = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
  return apiFetch<PaperDistributionOut[]>(`/api/teacher/paper-distributions${q}`);
}

export async function createPaperDistribution(body: {
  paper_id: number;
  class_id: string;
  due_at: string;
  instructions?: string;
  allow_download: boolean;
  allow_online_practice: boolean;
  allow_online_exam?: boolean;
  allow_written_submission?: boolean;
  title?: string;
}): Promise<PaperDistributionOut> {
  return apiFetch<PaperDistributionOut>("/api/teacher/paper-distributions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPaperDistributionDetail(
  distributionId: string,
): Promise<PaperDistributionDetail> {
  return apiFetch<PaperDistributionDetail>(
    `/api/teacher/paper-distributions/${encodeURIComponent(distributionId)}`,
  );
}

export async function deletePaperDistribution(distributionId: string): Promise<{
  deleted: boolean;
  distribution_id: string;
}> {
  return apiFetch(`/api/teacher/paper-distributions/${encodeURIComponent(distributionId)}`, {
    method: "DELETE",
  });
}

export async function fetchStudentPapers(
  status?: StudentPaperListTab,
): Promise<StudentPaperItem[]> {
  const q =
    status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<StudentPaperItem[]>(`/api/student/papers${q}`);
}

export async function fetchStudentPaperDetail(
  distributionId: string,
): Promise<StudentPaperDetail> {
  return apiFetch<StudentPaperDetail>(
    `/api/student/papers/${encodeURIComponent(distributionId)}`,
  );
}

export async function fetchStudentPaperDownload(
  distributionId: string,
): Promise<{ download_url: string }> {
  return apiFetch<{ download_url: string }>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/download`,
  );
}

export async function startPaperPractice(
  distributionId: string,
): Promise<PaperPracticeStart> {
  return apiFetch<PaperPracticeStart>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/practice/start`,
    { method: "POST" },
  );
}

export async function resumePaperPractice(
  distributionId: string,
): Promise<PaperPracticeStart> {
  return apiFetch<PaperPracticeStart>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/practice/resume`,
  );
}

export async function submitPaperPractice(
  distributionId: string,
  answers: { question_id: string; answer: string }[],
): Promise<PaperPracticeSubmitResult> {
  return apiFetch<PaperPracticeSubmitResult>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/practice/submit`,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
    },
  );
}

export async function startPaperExam(
  distributionId: string,
): Promise<PaperPracticeStart> {
  return apiFetch<PaperPracticeStart>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/exam/start`,
    { method: "POST" },
  );
}

export async function resumePaperExam(
  distributionId: string,
): Promise<PaperPracticeStart> {
  return apiFetch<PaperPracticeStart>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/exam/resume`,
  );
}

export async function savePaperExamDraft(
  distributionId: string,
  answers: { question_id: string; answer: string }[],
): Promise<{ ok: boolean; attempt_id: string }> {
  return apiFetch<{ ok: boolean; attempt_id: string }>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/exam/draft`,
    {
      method: "PATCH",
      body: JSON.stringify({ answers }),
    },
  );
}

export async function submitPaperExam(
  distributionId: string,
  answers: { question_id: string; answer: string }[],
): Promise<PaperExamSubmitResult> {
  return apiFetch<PaperExamSubmitResult>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/exam/submit`,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
    },
  );
}

export async function fetchPaperExamResult(
  distributionId: string,
): Promise<PaperExamResult> {
  return apiFetch<PaperExamResult>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/exam/result`,
  );
}

export async function fetchWrittenSubmissionStatus(
  distributionId: string,
): Promise<PaperWrittenStatus> {
  return apiFetch<PaperWrittenStatus>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/written`,
  );
}

export async function uploadWrittenAnswerSheets(
  distributionId: string,
  files: File[],
): Promise<{ submission_id: string; file_count: number; status: string }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return apiUpload(
    `/api/student/papers/${encodeURIComponent(distributionId)}/written/upload`,
    form,
  );
}

export async function submitWrittenAnswerSheets(
  distributionId: string,
): Promise<{ submission_id: string; status: string; file_count: number }> {
  return apiFetch(
    `/api/student/papers/${encodeURIComponent(distributionId)}/written/submit`,
    { method: "POST" },
  );
}

export async function fetchWrittenSubmissionResult(
  distributionId: string,
): Promise<PaperWrittenResult> {
  return apiFetch<PaperWrittenResult>(
    `/api/student/papers/${encodeURIComponent(distributionId)}/written/result`,
  );
}

export async function fetchTeacherExamAttempt(
  attemptId: string,
): Promise<TeacherExamAttemptDetail> {
  return apiFetch<TeacherExamAttemptDetail>(
    `/api/teacher/paper-exam-attempts/${encodeURIComponent(attemptId)}`,
  );
}

export async function fetchTeacherPracticeAttempt(
  attemptId: string,
): Promise<TeacherPracticeAttemptDetail> {
  return apiFetch<TeacherPracticeAttemptDetail>(
    `/api/teacher/paper-practice-attempts/${encodeURIComponent(attemptId)}`,
  );
}

export async function gradeTeacherExamAttempt(
  attemptId: string,
  body: {
    items: Array<{
      question_id: string;
      teacher_marks?: number | null;
      teacher_comment?: string | null;
    }>;
    finalize: boolean;
  },
): Promise<{
  attempt_id: string;
  ai_score?: number | null;
  teacher_score?: number | null;
  max_score?: number | null;
  grading_status: string;
  percentage: number;
  items: PaperExamGradeItem[];
}> {
  return apiFetch(`/api/teacher/paper-exam-attempts/${encodeURIComponent(attemptId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchTeacherWrittenSubmission(
  submissionId: string,
): Promise<TeacherWrittenSubmissionDetail> {
  return apiFetch<TeacherWrittenSubmissionDetail>(
    `/api/teacher/paper-written-submissions/${encodeURIComponent(submissionId)}`,
  );
}

export async function gradeTeacherWrittenSubmission(
  submissionId: string,
  body: {
    items: Array<{
      question_id: string;
      teacher_marks?: number | null;
      teacher_comment?: string | null;
    }>;
    finalize: boolean;
  },
): Promise<{
  submission_id: string;
  teacher_score?: number | null;
  max_score?: number | null;
  status: string;
  percentage?: number | null;
  items: PaperExamGradeItem[];
}> {
  return apiFetch(
    `/api/teacher/paper-written-submissions/${encodeURIComponent(submissionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchStudentAssignment(
  id: string,
): Promise<AssignmentDetail> {
  return apiFetch<AssignmentDetail>(`/api/student/assignments/${id}`);
}

export async function startQuizAttempt(
  assignmentId: string,
): Promise<AttemptStart> {
  return apiFetch<AttemptStart>(`/api/student/quizzes/${assignmentId}/start`, {
    method: "POST",
  });
}

export async function submitQuizAttempt(
  assignmentId: string,
  answers: { question_id: string; answer: string }[],
): Promise<AttemptSubmitResult> {
  return apiFetch<AttemptSubmitResult>(
    `/api/student/quizzes/${assignmentId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
    },
  );
}

export async function fetchTeacherDashboard(classId?: string) {
  const q = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
  return apiFetch(`/api/teacher/dashboard${q}`);
}

// ── Admin portal API (school-scoped) ─────────────────────────────────────────

export type AdminClassListOut = {
  id: string;
  name: string;
  grade: string;
  section?: string | null;
  school_id?: string | null;
  join_code?: string | null;
  academic_year?: string | null;
  is_active?: boolean;
  student_count: number;
};

export type AdminSettings = {
  school_id: string;
  school_name: string;
  board: string;
  board_label?: string;
  curriculum?: string;
  academic_year: string;
  session_start_month: number;
  session_end_month: number;
  logo_url?: string | null;
  address?: string | null;
  settings: Record<string, boolean>;
  notifications: Record<string, boolean>;
};

export type AdminSettingsUpdatePayload = {
  school_name?: string;
  academic_year?: string;
  session_start_month?: number;
  session_end_month?: number;
  address?: string | null;
  settings?: Record<string, boolean>;
  notifications?: Record<string, boolean>;
};

export const NCERT_CURRICULUM_LABEL = "CBSE (NCERT)";
export const LEARNINGBIX_COMPANY_NAME = "LearningBix";

/** School identity returned by GET /api/portal/branding */
export type SchoolBranding = {
  school_id: string;
  school_name: string;
  logo_url?: string | null;
  academic_year: string;
};

export async function fetchSchoolBranding(): Promise<SchoolBranding> {
  return apiFetch<SchoolBranding>("/api/portal/branding");
}

export async function fetchPublicSchoolBranding(): Promise<SchoolBranding> {
  const res = await fetch(apiUrl("/api/portal/branding/public"), { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === "string" ? err.detail : "Failed to load school branding",
    );
  }
  return res.json() as Promise<SchoolBranding>;
}

export const SESSION_MONTHS: Array<{ value: number; label: string }> = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

/** Human-readable session window, e.g. "April – March". */
export function formatSessionRange(startMonth: number, endMonth: number): string {
  const start = SESSION_MONTHS.find((m) => m.value === startMonth)?.label ?? "";
  const end = SESSION_MONTHS.find((m) => m.value === endMonth)?.label ?? "";
  if (!start || !end) return "";
  return `${start} – ${end}`;
}

/** e.g. 2025 → "2025-26" */
export function formatAcademicYear(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${String(end).padStart(2, "0")}`;
}

/** Start calendar year of the active session (sessionStartMonth: 1=Jan … 12=Dec). */
export function currentAcademicYearStart(
  reference = new Date(),
  sessionStartMonth = 4,
): number {
  const year = reference.getFullYear();
  const startMonthIndex = sessionStartMonth - 1;
  return reference.getMonth() >= startMonthIndex ? year : year - 1;
}

/** Suggested years around the current session — schools can still type any value. */
export function getAdminAcademicYearOptions(
  reference = new Date(),
  includeValue?: string | null,
  sessionStartMonth = 4,
): string[] {
  const start = currentAcademicYearStart(reference, sessionStartMonth);
  const options = new Set<string>();
  for (let offset = -2; offset <= 5; offset += 1) {
    options.add(formatAcademicYear(start + offset));
  }
  const extra = includeValue?.trim();
  if (extra) options.add(extra);
  return Array.from(options).sort(
    (a, b) => parseInt(a.split("-")[0], 10) - parseInt(b.split("-")[0], 10),
  );
}

export type AdminDashboard = {
  school_name: string;
  academic_year: string;
  greeting_name: string;
  date_label: string;
  header_subtitle: string;
  metrics: Array<{
    label: string;
    value: number | string;
    sublabel: string;
    trend?: string | null;
    trend_type?: "up" | "down" | "neutral" | "warn" | null;
  }>;
  class_performance: Array<{
    id: string;
    name: string;
    student_count: number;
    avg_score: number | null;
    at_risk_count: number;
  }>;
  at_risk_students: Array<{
    student_id: number;
    full_name: string;
    class_id: string | null;
    class_name: string | null;
    subjects: string[];
    avg_score: number;
  }>;
  recent_activity: Array<{
    timestamp: string;
    label: string;
    kind?: string | null;
  }>;
  pending_reviews: number;
};

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch<AdminDashboard>("/api/admin/dashboard");
}

export async function fetchAdminClasses(): Promise<AdminClassListOut[]> {
  return apiFetch<AdminClassListOut[]>("/api/admin/classes");
}

export type AdminClassCreatePayload = {
  grade: string;
  section?: string | null;
  academic_year?: string;
};

export type AdminClassUpdatePayload = {
  name?: string;
  grade?: string;
  section?: string | null;
  academic_year?: string;
  is_active?: boolean;
};

export async function createAdminClass(
  payload: AdminClassCreatePayload,
): Promise<AdminClassListOut> {
  return apiFetch<AdminClassListOut>("/api/admin/classes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClass(
  classId: string,
  payload: AdminClassUpdatePayload,
): Promise<AdminClassListOut> {
  return apiFetch<AdminClassListOut>(`/api/admin/classes/${encodeURIComponent(classId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminClass(classId: string): Promise<void> {
  await apiFetch<void>(`/api/admin/classes/${encodeURIComponent(classId)}`, {
    method: "DELETE",
  });
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return apiFetch<AdminSettings>("/api/admin/settings");
}

export async function updateAdminSettings(
  payload: AdminSettingsUpdatePayload,
): Promise<AdminSettings> {
  return apiFetch<AdminSettings>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadAdminSchoolLogo(file: File): Promise<AdminSettings> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<AdminSettings>("/api/admin/settings/logo", form);
}

export type AdminTeacherAssignment = {
  id: number;
  teacher_id: number;
  teacher_name: string;
  teacher_email: string;
  class_id: string;
  class_name: string;
  subjects: string[];
  academic_year: string;
};

export type AdminUnassignedTeacher = {
  id: number;
  full_name: string;
  email: string;
};

export type AdminTeacherSubjectsList = {
  assignments: AdminTeacherAssignment[];
  unassigned_teachers: AdminUnassignedTeacher[];
  available_subjects: string[];
};

export async function fetchAdminTeacherSubjects(): Promise<AdminTeacherSubjectsList> {
  return apiFetch<AdminTeacherSubjectsList>("/api/admin/teacher-subjects");
}

export type AdminTeacherSubjectCreatePayload = {
  teacher_id: number;
  class_id: string;
  subjects: string[];
  academic_year?: string;
};

export type AdminTeacherSubjectUpdatePayload = {
  class_id?: string;
  subjects?: string[];
  academic_year?: string;
};

export async function createAdminTeacherAssignment(
  payload: AdminTeacherSubjectCreatePayload,
): Promise<AdminTeacherAssignment> {
  return apiFetch<AdminTeacherAssignment>("/api/admin/teacher-subjects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminTeacherAssignment(
  mappingId: number,
  payload: AdminTeacherSubjectUpdatePayload,
): Promise<AdminTeacherAssignment> {
  return apiFetch<AdminTeacherAssignment>(
    `/api/admin/teacher-subjects/${mappingId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminTeacherAssignment(mappingId: number): Promise<void> {
  await apiFetch<void>(`/api/admin/teacher-subjects/${mappingId}`, {
    method: "DELETE",
  });
}

// ── Admin users / students ───────────────────────────────────────────────────

export type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: "student" | "teacher" | "admin";
  grade: string | null;
  roll_no: string | null;
  class_id: string | null;
  avatar_initials: string | null;
  password: string | null;
  created_at: string;
};

export type AdminUserCreatePayload = {
  email: string;
  password: string;
  full_name: string;
  role?: "student" | "teacher" | "admin";
  grade?: string | null;
  roll_no?: string | null;
  class_id?: string | null;
};

export type AdminUserUpdatePayload = {
  full_name?: string;
  grade?: string | null;
  roll_no?: string | null;
  class_id?: string | null;
  password?: string;
};

export type AdminStudentImportRow = {
  full_name?: string;
  name?: string;
  email: string;
  class_id?: string;
  class?: string;
  roll_no?: string;
  roll?: string;
};

export type AdminStudentImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; email: string | null; reason: string }>;
};

export type AtRiskStudentRow = {
  student_id: number;
  full_name: string;
  subjects: string[];
  avg_score: number;
  weeks_below: number;
};

export async function fetchAdminUsers(params?: {
  role?: string;
  class_id?: string;
  search?: string;
  limit?: number;
}): Promise<AdminUser[]> {
  const qs = new URLSearchParams();
  if (params?.role) qs.set("role", params.role);
  if (params?.class_id) qs.set("class_id", params.class_id);
  if (params?.search) qs.set("search", params.search);
  qs.set("limit", String(params?.limit ?? 200));
  const query = qs.toString();
  return apiFetch<AdminUser[]>(`/api/admin/users${query ? `?${query}` : ""}`);
}

export async function createAdminUser(payload: AdminUserCreatePayload): Promise<AdminUser> {
  return apiFetch<AdminUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ role: "student", ...payload }),
  });
}

export async function updateAdminUser(
  userId: number,
  payload: AdminUserUpdatePayload,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(userId: number): Promise<void> {
  await apiFetch<void>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function moveAdminStudentClass(
  studentId: number,
  classId: string,
  rollNo?: string | null,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/students/${studentId}/class`, {
    method: "PATCH",
    body: JSON.stringify({
      class_id: classId,
      roll_no: rollNo ?? null,
    }),
  });
}

export async function importAdminStudents(
  rows: AdminStudentImportRow[],
  defaultPassword?: string,
): Promise<AdminStudentImportResult> {
  return apiFetch<AdminStudentImportResult>("/api/admin/students/import", {
    method: "POST",
    body: JSON.stringify({
      rows,
      default_password: defaultPassword ?? "student123",
    }),
  });
}

export async function fetchAtRiskStudents(classId?: string): Promise<AtRiskStudentRow[]> {
  const qs = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
  return apiFetch<AtRiskStudentRow[]>(`/api/analytics/at-risk${qs}`);
}

export type ClassOut = {
  id: string;
  name: string;
  grade: string;
  section?: string | null;
  school_id?: string | null;
};

export async function fetchTeacherClasses(): Promise<ClassOut[]> {
  return apiFetch<ClassOut[]>("/api/teacher/classes");
}

export type StudentClassOut = {
  id: string;
  name: string;
  grade: string;
  section: string;
  student_count: number;
};

export async function fetchStudentClassMe(): Promise<StudentClassOut> {
  return apiFetch<StudentClassOut>("/api/student/classes/me");
}

export async function fetchTeacherQuizzes(): Promise<QuizOut[]> {
  return apiFetch<QuizOut[]>("/api/teacher/quizzes");
}

export async function fetchTeacherQuiz(quizId: string): Promise<QuizOut> {
  return apiFetch<QuizOut>(
    `/api/teacher/quizzes/${encodeURIComponent(quizId)}`,
  );
}

export type QuizDeleteResult = {
  deleted: boolean;
  quiz_id: string;
  assignments_removed: number;
  attempts_removed: number;
};

export async function deleteTeacherQuiz(
  quizId: string,
): Promise<QuizDeleteResult> {
  return apiFetch<QuizDeleteResult>(
    `/api/teacher/quizzes/${encodeURIComponent(quizId)}`,
    { method: "DELETE" },
  );
}

export async function createTeacherQuiz(body: {
  title: string;
  subject: string;
  duration_mins: number;
  total_marks: number;
  questions: Array<Record<string, unknown>>;
  ncert_class?: string;
  chapter_label?: string;
  kb_name?: string;
  pdf_url?: string;
}): Promise<QuizOut> {
  return apiFetch<QuizOut>("/api/teacher/quizzes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function publishTeacherQuiz(quizId: string): Promise<QuizOut> {
  return apiFetch<QuizOut>(`/api/teacher/quizzes/${quizId}/publish`, {
    method: "POST",
  });
}

export async function fetchTeacherAssignments(
  classId?: string,
): Promise<AssignmentItem[]> {
  const q = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
  return apiFetch<AssignmentItem[]>(`/api/teacher/assignments${q}`);
}

export async function updateTeacherQuiz(
  quizId: string,
  body: Partial<{
    title: string;
    subject: string;
    duration_mins: number;
    total_marks: number;
    questions: Array<Record<string, unknown>>;
    status: "draft" | "published";
  }>,
): Promise<QuizOut> {
  return apiFetch<QuizOut>(`/api/teacher/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function createTeacherAssignment(body: {
  title: string;
  class_id: string;
  quiz_id: string;
  subject?: string;
  marks?: number;
  duration_mins?: number;
  due_at: string;
  instructions?: string;
}): Promise<AssignmentItem> {
  return apiFetch<AssignmentItem>("/api/teacher/assignments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type StudentAttemptRow = {
  student_id: number;
  full_name: string;
  roll_no?: string | null;
  status: string;
  score?: number | null;
  max_score?: number | null;
  attempt_number: number;
  attempt_id?: number | null;
  completed_at?: string | null;
};

export type TeacherQuizQuestionReview = {
  question_id: string;
  text: string;
  type: string;
  marks: number;
  options?: string[] | null;
  correct_answer?: string | null;
  student_answer: string;
  feedback: string;
  is_correct: boolean | null;
  marks_awarded: number;
  marked_for_review: boolean;
};

export type TeacherQuizAttemptDetail = {
  assignment_id: string;
  attempt_id: number;
  title: string;
  subject?: string | null;
  class_id: string;
  student_id: number;
  student_name: string;
  roll_no?: string | null;
  status: string;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  attempt_number: number;
  started_at?: string | null;
  completed_at?: string | null;
  time_taken_mins?: number | null;
  questions: TeacherQuizQuestionReview[];
  marked_for_review: string[];
};

export async function fetchAssignmentAttempts(assignmentId: string): Promise<{
  assignment_id: string;
  title: string;
  class_id: string;
  subject?: string | null;
  marks?: number;
  duration_mins?: number;
  due_label?: string;
  students: StudentAttemptRow[];
}> {
  return apiFetch(`/api/teacher/assignments/${assignmentId}/attempts`);
}

export async function fetchTeacherQuizAttemptDetail(
  assignmentId: string,
  attemptId: number,
): Promise<TeacherQuizAttemptDetail> {
  return apiFetch<TeacherQuizAttemptDetail>(
    `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/attempts/${attemptId}`,
  );
}

export async function downloadAssignmentScoresCsv(
  assignmentId: string,
  filename?: string,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(
    apiUrl(`/api/teacher/assignments/${encodeURIComponent(assignmentId)}/export`),
    {
      cache: "no-store",
      headers: authHeaders(token),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: string }).detail;
    throw new Error(
      typeof detail === "string" ? detail : `Export failed (${res.status})`,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `assignment-${assignmentId}-scores.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type AssignmentDeleteResult = {
  deleted: boolean;
  assignment_id: string;
  quiz_id?: string | null;
  quiz_deleted?: boolean;
  attempts_removed: number;
  assignments_removed?: number;
};

/** Remove assignment and linked quiz (My Quizzes + student views). */
export async function deleteTeacherAssignment(
  assignmentId: string,
): Promise<AssignmentDeleteResult> {
  return apiFetch<AssignmentDeleteResult>(
    `/api/teacher/assignments/${encodeURIComponent(assignmentId)}`,
    { method: "DELETE" },
  );
}

export type ExamCalendarSlotChapter = {
  id?: number;
  chapter_key: string;
  chapter_label: string;
  ncert_class?: string | null;
  pdf_url?: string | null;
};

export type ExamCalendarSlot = {
  id: string;
  sort_order: number;
  slot_type: string;
  title: string;
  exam_date?: string | null;
  marks?: number | null;
  duration_mins?: number | null;
  instructions?: string | null;
  linked_paper_id?: number | null;
  linked_assignment_id?: string | null;
  linked_distribution_id?: string | null;
  chapters: ExamCalendarSlotChapter[];
};

export type ExamCalendar = {
  id: string;
  class_id: string;
  subject: string;
  academic_year: string;
  template_id: string;
  status: string;
  slots: ExamCalendarSlot[];
  overlap_warnings?: string[];
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExamCalendarSummary = {
  id: string;
  class_id: string;
  subject: string;
  academic_year: string;
  template_id: string;
  status: string;
  slot_count: number;
  published_at?: string | null;
};

export type ExamCalendarUpcomingSlot = {
  calendar_id: string;
  slot_id: string;
  title: string;
  subject: string;
  exam_date: string | null;
  chapter_summary: string;
  slot_type: string;
  linked_paper_id?: number | null;
  linked_distribution_id?: string | null;
};

function examCalendarQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function createTeacherExamCalendar(body: {
  class_id: string;
  subject: string;
  academic_year?: string;
  template_id: string;
}): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>("/api/teacher/exam-calendars", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchTeacherExamCalendars(params?: {
  class_id?: string;
  subject?: string;
  academic_year?: string;
}): Promise<ExamCalendarSummary[]> {
  return apiFetch<ExamCalendarSummary[]>(
    `/api/teacher/exam-calendars${examCalendarQuery(params ?? {})}`,
  );
}

export async function fetchTeacherExamCalendar(
  calendarId: string,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}`,
  );
}

export async function patchTeacherExamCalendar(
  calendarId: string,
  body: Partial<{
    class_id: string;
    subject: string;
    academic_year: string;
    template_id: string;
  }>,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function saveTeacherExamCalendarSlots(
  calendarId: string,
  slots: Array<{
    id?: string | null;
    sort_order: number;
    slot_type: string;
    title: string;
    exam_date?: string | null;
    marks?: number | null;
    duration_mins?: number | null;
    instructions?: string | null;
    chapters: ExamCalendarSlotChapter[];
  }>,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/slots`,
    { method: "PUT", body: JSON.stringify({ slots }) },
  );
}

export async function publishTeacherExamCalendar(
  calendarId: string,
  opts?: { strict_overlap?: boolean },
): Promise<{
  ok: boolean;
  errors: string[];
  calendar?: ExamCalendar | null;
}> {
  const q = opts?.strict_overlap ? "?strict_overlap=true" : "";
  return apiFetch(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/publish${q}`,
    { method: "POST" },
  );
}

export async function unpublishTeacherExamCalendar(
  calendarId: string,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/unpublish`,
    { method: "POST" },
  );
}

export async function duplicateTeacherExamCalendar(
  calendarId: string,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/duplicate`,
    { method: "POST" },
  );
}

export async function copyTeacherExamCalendar(
  calendarId: string,
  body: { class_id?: string; academic_year?: string; subject?: string },
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/copy`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function teacherExamCalendarIcsUrl(calendarId: string): string {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_API_BASE ?? "";
  return `${base}/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/export.ics`;
}

export async function linkTeacherExamCalendarSlotAssignment(
  calendarId: string,
  slotId: string,
  assignmentId: string,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/slots/${encodeURIComponent(slotId)}/link-assignment`,
    {
      method: "PATCH",
      body: JSON.stringify({ assignment_id: assignmentId }),
    },
  );
}

export async function fetchTeacherExamCalendarUpcoming(
  classId: string,
  opts?: {
    subject?: string;
    limit?: number;
    scope?: "upcoming" | "published";
  },
): Promise<{ slots: ExamCalendarUpcomingSlot[] }> {
  const q = examCalendarQuery({
    class_id: classId,
    subject: opts?.subject,
    limit: opts?.limit != null ? String(opts.limit) : undefined,
    scope: opts?.scope,
  });
  return apiFetch(`/api/teacher/exam-calendars/upcoming${q}`);
}

export async function fetchStudentExamCalendar(): Promise<{
  calendars: ExamCalendar[];
}> {
  return apiFetch("/api/student/exam-calendar");
}

export async function linkTeacherExamCalendarSlotPaper(
  calendarId: string,
  slotId: string,
  paperId: number,
): Promise<ExamCalendar> {
  return apiFetch<ExamCalendar>(
    `/api/teacher/exam-calendars/${encodeURIComponent(calendarId)}/slots/${encodeURIComponent(slotId)}/link-paper`,
    { method: "PATCH", body: JSON.stringify({ paper_id: paperId }) },
  );
}
