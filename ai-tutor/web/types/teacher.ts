export interface TeacherMetric {
  label: string;
  value: number | string;
  sublabel: string;
  trend?: string;
  trend_type?: "up" | "down" | "neutral" | "warn";
}

export interface HeatmapStudent {
  id: number;
  name: string;
  short_name: string;
  initials: string;
  scores: Record<string, number>;
}

export interface WeakStudentRow {
  id: number;
  full_name: string;
  initials: string;
  topics: string[];
  topics_label: string;
  avg_score: number;
}

export interface TeacherDashboard {
  greeting_name: string;
  date_label: string;
  header_subtitle: string;
  class_id: string;
  class_name: string;
  classes: { id: string; name: string }[];
  metrics: TeacherMetric[];
  heatmap_topics: string[];
  teaching_subjects?: string[];
  heatmap_students: HeatmapStudent[];
  weak_students: WeakStudentRow[];
  nav_badges: Record<string, number>;
  papers_pending_review: number;
  papers_distributed_count: number;
  total_students: number;
}
