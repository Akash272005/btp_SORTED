export type UserRole = "student" | "teacher" | "admin";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  grade?: string | null;
  roll_no?: string | null;
  class_id?: string | null;
  avatar_initials?: string | null;
}

/** Subset of paper list fields used on student dashboard cards. */
export interface StudentPaperSummary {
  distribution_id: string;
  paper_id: number;
  title: string;
  subject?: string | null;
  due_at: string;
  due_label: string;
  status: "new" | "downloaded" | "overdue" | "completed";
  total_marks: number;
  duration_mins: number;
  allow_online_exam?: boolean;
  allow_written_submission?: boolean;
  allow_online_practice?: boolean;
  submission_mode_label?: string;
  progress_label?: string;
  teacher_name?: string | null;
  chapter_label?: string | null;
}

export interface AssignmentItem {
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
  instructions?: string | null;
  last_score?: number | null;
  last_max_score?: number | null;
  last_percentage?: number | null;
}

export interface StudentDashboard {
  greeting_name: string;
  date_label: string;
  class_label: string;
  streak_days: number;
  exam_days_left: number;
  exam_message: string;
  ai_insight: string;
  overall_accuracy: number;
  accuracy_delta: number;
  quizzes_pending: number;
  quizzes_due_tomorrow: number;
  papers_pending: number;
  papers_due_tomorrow: number;
  recent_papers: StudentPaperSummary[];
  topics_mastered: number;
  topics_total: number;
  xp_this_week: number;
  xp_rank_label: string;
  assignments: AssignmentItem[];
  topic_heatmap: { topic: string; subject: string; score: number; level: string }[];
  subject_proficiency: { subject: string; accuracy: number; color: string }[];
  nav_badges: Record<string, number>;
}
