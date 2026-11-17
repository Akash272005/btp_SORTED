"""Pydantic schemas for LMS API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.lms.constants import MAX_NCERT_QUIZ_GENERATE_QUESTIONS


Role = Literal["student", "teacher", "admin"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Role


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Role
    grade: str | None = None
    roll_no: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    redirect: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    grade: str | None = None
    roll_no: str | None = None
    class_id: str | None = None
    class_name: str | None = None
    avatar_initials: str | None = None

    class Config:
        from_attributes = True


class ClassOut(BaseModel):
    id: str
    name: str
    grade: str
    section: str | None = None
    school_id: str | None = None

    class Config:
        from_attributes = True


class StudentClassOut(BaseModel):
    id: str
    name: str
    grade: str
    section: str
    student_count: int = 0


class GoogleAuthRequest(BaseModel):
    id_token: str
    role: Role


# ── Admin user management ────────────────────────────────────────────────────

class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Role = "student"
    grade: str | None = None
    roll_no: str | None = None
    class_id: str | None = None


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    grade: str | None = None
    roll_no: str | None = None
    class_id: str | None = None
    password: str | None = None


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    email: str
    full_name: str
    role: Role
    grade: str | None = None
    roll_no: str | None = None
    class_id: str | None = None
    avatar_initials: str | None = None
    password: str | None = Field(default=None, validation_alias="password_plain")
    created_at: datetime


# ── Admin student ops (move class, CSV import) ───────────────────────────────

class AdminStudentMove(BaseModel):
    class_id: str
    roll_no: str | None = None


class AdminStudentImportRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: str | None = None
    name: str | None = None
    email: EmailStr
    class_id: str | None = None
    class_: str | None = Field(default=None, alias="class")
    roll_no: str | None = None
    roll: str | None = None


class AdminStudentImportRequest(BaseModel):
    rows: list[AdminStudentImportRow]
    default_password: str | None = "student123"


class AdminStudentImportError(BaseModel):
    row: int
    email: str | None = None
    reason: str


class AdminStudentImportOut(BaseModel):
    created: int
    skipped: int
    errors: list[AdminStudentImportError] = Field(default_factory=list)


# ── Admin classes ────────────────────────────────────────────────────────────

class AdminClassListOut(BaseModel):
    id: str
    name: str
    grade: str
    section: str | None = None
    school_id: str | None = None
    join_code: str | None = None
    academic_year: str | None = None
    is_active: bool = True
    student_count: int = 0


class AdminClassCreate(BaseModel):
    grade: str = Field(..., min_length=1, max_length=32)
    section: str | None = Field(None, max_length=8)
    academic_year: str | None = Field(None, max_length=16)


class AdminClassUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    grade: str | None = Field(None, min_length=1, max_length=32)
    section: str | None = Field(None, max_length=8)
    academic_year: str | None = Field(None, min_length=1, max_length=16)
    is_active: bool | None = None


# ── Admin teacher ↔ class ↔ subject ──────────────────────────────────────────

class AdminTeacherAssignmentOut(BaseModel):
    id: int
    teacher_id: int
    teacher_name: str
    teacher_email: str
    class_id: str
    class_name: str
    subjects: list[str]
    academic_year: str


class AdminUnassignedTeacherOut(BaseModel):
    id: int
    full_name: str
    email: str


class AdminTeacherSubjectsListOut(BaseModel):
    assignments: list[AdminTeacherAssignmentOut] = Field(default_factory=list)
    unassigned_teachers: list[AdminUnassignedTeacherOut] = Field(default_factory=list)
    available_subjects: list[str] = Field(default_factory=list)


class AdminTeacherSubjectCreate(BaseModel):
    teacher_id: int
    class_id: str = Field(min_length=1)
    subjects: list[str] = Field(min_length=1)
    academic_year: str | None = Field(None, max_length=16)


class AdminTeacherSubjectUpdate(BaseModel):
    class_id: str | None = Field(None, min_length=1)
    subjects: list[str] | None = None
    academic_year: str | None = Field(None, min_length=1, max_length=16)


# ── Admin school settings & portal branding ────────────────────────────────────

class AdminSettingsOut(BaseModel):
    school_id: str
    school_name: str
    board: str
    board_label: str = "CBSE (NCERT)"
    curriculum: str = "CBSE (NCERT)"
    academic_year: str
    session_start_month: int = Field(default=4, ge=1, le=12)
    session_end_month: int = Field(default=3, ge=1, le=12)
    logo_url: str | None = None
    address: str | None = None
    settings: dict[str, bool] = Field(default_factory=dict)
    notifications: dict[str, bool] = Field(default_factory=dict)


class AdminSettingsUpdate(BaseModel):
    school_name: str | None = None
    board: str | None = None
    academic_year: str | None = Field(default=None, min_length=1, max_length=32)
    session_start_month: int | None = Field(default=None, ge=1, le=12)
    session_end_month: int | None = Field(default=None, ge=1, le=12)
    logo_url: str | None = None
    address: str | None = None
    settings: dict[str, bool] | None = None
    notifications: dict[str, bool] | None = None


class SchoolBrandingOut(BaseModel):
    """Lightweight school identity for sidebar, login, and header (no toggles)."""
    school_id: str
    school_name: str
    logo_url: str | None = None
    academic_year: str


class AssignmentOut(BaseModel):
    id: str
    title: str
    teacher_name: str
    subject: str | None = None
    marks: int
    duration_mins: int
    due_at: datetime
    due_label: str
    attempts_used: int
    max_attempts: int
    can_attempt: bool
    status: str
    quiz_id: str | None = None
    instructions: str | None = None
    last_score: float | None = None
    last_max_score: float | None = None
    last_percentage: float | None = None
    student_count: int = 0
    submitted_count: int = 0


class QuizQuestionOut(BaseModel):
    id: str
    type: Literal["mcq", "short_answer"] = "mcq"
    text: str
    marks: int = 1
    options: list[str] | None = None


class QuizOut(BaseModel):
    id: str
    teacher_id: int
    title: str
    subject: str
    status: str
    duration_mins: int
    total_marks: int
    questions: list[dict] | None = None
    ncert_class: str | None = None
    chapter_label: str | None = None
    kb_name: str | None = None
    pdf_url: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class GenerateFromNcertIn(BaseModel):
    chapter_label: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    kb_name: str | None = None  # resolved to ncert-class-{N}-{subject} if omitted
    pdf_url: str | None = None
    count: int = Field(default=5, ge=1, le=MAX_NCERT_QUIZ_GENERATE_QUESTIONS)
    ncert_class: str | None = None
    title: str | None = None

    def resolved_kb_name(self) -> str:
        """Derive the best KB name from class + subject if not explicitly set."""
        if self.kb_name:
            return self.kb_name
        n = (self.ncert_class or "").replace("class-", "").strip()
        subj = self.subject.lower().replace(" ", "-") if self.subject else ""
        if n and subj:
            return f"ncert-class-{n}-{subj}"
        if n:
            return f"ncert-class-{n}"
        return "ncert-class-8"


class GenerateFromNcertOut(BaseModel):
    success: bool
    questions: list[dict] = Field(default_factory=list)
    requested: int = 0
    completed: int = 0
    failed: int = 0
    duration_secs: float | None = None
    stage_times: dict[str, float] | None = None
    error: str | None = None
    suggested_title: str | None = None


class QuizCreateIn(BaseModel):
    title: str
    subject: str = "General"
    duration_mins: int = 30
    total_marks: int = 10
    questions: list[dict] = Field(default_factory=list)
    ncert_class: str | None = None
    chapter_label: str | None = None
    kb_name: str | None = None
    pdf_url: str | None = None


class QuizUpdateIn(BaseModel):
    title: str | None = None
    subject: str | None = None
    duration_mins: int | None = None
    total_marks: int | None = None
    questions: list[dict] | None = None
    status: Literal["draft", "published"] | None = None


class QuizDeleteOut(BaseModel):
    deleted: bool = True
    quiz_id: str
    assignments_removed: int = 0
    attempts_removed: int = 0


class AssignmentDeleteOut(BaseModel):
    deleted: bool = True
    assignment_id: str
    quiz_id: str | None = None
    quiz_deleted: bool = False
    attempts_removed: int = 0
    assignments_removed: int = 0


class AssignmentCreateIn(BaseModel):
    title: str
    class_id: str
    quiz_id: str
    subject: str | None = None
    marks: int | None = None
    duration_mins: int | None = None
    due_at: datetime
    policy_id: int | None = None
    instructions: str | None = None


class AssignmentDetailOut(BaseModel):
    assignment: AssignmentOut
    questions: list[dict]
    attempt_id: int | None = None
    in_progress: bool = False


class AttemptStartOut(BaseModel):
    attempt_id: int
    assignment_id: str
    quiz_id: str
    attempt_number: int
    questions: list[dict]
    duration_mins: int
    started_at: datetime
    saved_answers: list[dict] = Field(default_factory=list)
    marked_for_review: list[str] = Field(default_factory=list)


class AnswerItemIn(BaseModel):
    question_id: str
    answer: str


class AttemptSubmitIn(BaseModel):
    answers: list[AnswerItemIn]


class AttemptDraftIn(BaseModel):
    answers: list[AnswerItemIn]
    marked_for_review: list[str] = Field(default_factory=list)


class AssignmentResultOut(BaseModel):
    assignment_id: str
    title: str
    attempt_id: int | None = None
    score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    feedback: dict[str, str] = Field(default_factory=dict)
    answers: list[dict] = Field(default_factory=list)
    questions: list[dict] = Field(default_factory=list)
    attempt_number: int = 0
    completed_at: datetime | None = None
    time_taken_mins: int | None = None


class AttemptSubmitOut(BaseModel):
    attempt_id: int
    score: float
    max_score: float
    percentage: float
    status: str
    feedback: dict[str, str] = Field(default_factory=dict)


class StudentAttemptRowOut(BaseModel):
    student_id: int
    full_name: str
    roll_no: str | None = None
    status: str
    score: float | None = None
    max_score: float | None = None
    attempt_number: int = 0
    attempt_id: int | None = None
    completed_at: datetime | None = None


class TeacherQuizQuestionReviewOut(BaseModel):
    question_id: str
    text: str
    type: str = "mcq"
    marks: float
    options: list | None = None
    correct_answer: str | None = None
    student_answer: str = ""
    feedback: str = ""
    is_correct: bool | None = None
    marks_awarded: float = 0
    marked_for_review: bool = False


class TeacherQuizAttemptDetailOut(BaseModel):
    assignment_id: str
    attempt_id: int
    title: str
    subject: str | None = None
    class_id: str
    student_id: int
    student_name: str
    roll_no: str | None = None
    status: str
    score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    attempt_number: int = 1
    started_at: datetime | None = None
    completed_at: datetime | None = None
    time_taken_mins: int | None = None
    questions: list[TeacherQuizQuestionReviewOut]
    marked_for_review: list[str] = Field(default_factory=list)


class AssignmentAttemptsOut(BaseModel):
    assignment_id: str
    title: str
    class_id: str
    subject: str | None = None
    marks: int = 10
    duration_mins: int = 30
    due_label: str = ""
    students: list[StudentAttemptRowOut]


class TopicHeatmapCell(BaseModel):
    topic: str
    subject: str
    score: float
    level: Literal["high", "medium", "low"]


class SubjectProficiency(BaseModel):
    subject: str
    accuracy: float
    color: str


class StudentDashboardOut(BaseModel):
    greeting_name: str
    date_label: str
    class_label: str
    streak_days: int
    exam_days_left: int
    exam_message: str
    ai_insight: str
    overall_accuracy: float
    accuracy_delta: float
    quizzes_pending: int
    quizzes_due_tomorrow: int
    papers_pending: int = 0
    papers_due_tomorrow: int = 0
    recent_papers: list["StudentPaperOut"] = Field(default_factory=list)
    topics_mastered: int
    topics_total: int
    xp_this_week: int
    xp_rank_label: str
    assignments: list[AssignmentOut]
    topic_heatmap: list[TopicHeatmapCell]
    subject_proficiency: list[SubjectProficiency]
    nav_badges: dict[str, int] = Field(default_factory=dict)


class ReattemptPolicyOut(BaseModel):
    maxAttempts: int
    unlockMode: Literal["immediate", "delayed", "conditional"]
    delayHours: int | None = None
    scoreThreshold: float | None = None
    generateNewVariant: bool


class GradeAnswerRequest(BaseModel):
    question_type: Literal["mcq", "fill_blank", "short_answer", "essay", "math"]
    student_answer: str
    correct_answer: str | None = None
    rubric: str | None = None
    max_marks: float = 1.0


class GradeAnswerResponse(BaseModel):
    score: float
    max_score: float
    feedback: str
    confidence: float
    requires_teacher_review: bool = False


class AtRiskStudent(BaseModel):
    student_id: int
    full_name: str
    subjects: list[str]
    avg_score: float
    weeks_below: int


class WeakTopicRow(BaseModel):
    topic: str
    class_avg: float
    students_below_threshold: int


class TeacherMetricOut(BaseModel):
    label: str
    value: str | int | float
    sublabel: str
    trend: str | None = None
    trend_type: Literal["up", "down", "neutral", "warn"] | None = None


# ── Admin dashboard payloads ─────────────────────────────────────────────────

class AdminActivityOut(BaseModel):
    timestamp: datetime
    label: str
    kind: str | None = None


class AdminClassPerformanceOut(BaseModel):
    id: str
    name: str
    student_count: int
    avg_score: float | None = None
    at_risk_count: int = 0


class AdminAtRiskRowOut(BaseModel):
    student_id: int
    full_name: str
    class_id: str | None = None
    class_name: str | None = None
    subjects: list[str] = Field(default_factory=list)
    avg_score: float


class AdminDashboardOut(BaseModel):
    school_name: str
    academic_year: str
    greeting_name: str
    date_label: str
    header_subtitle: str
    metrics: list[TeacherMetricOut]
    class_performance: list[AdminClassPerformanceOut] = Field(default_factory=list)
    at_risk_students: list[AdminAtRiskRowOut] = Field(default_factory=list)
    recent_activity: list[AdminActivityOut] = Field(default_factory=list)
    pending_reviews: int = 0


class HeatmapStudentOut(BaseModel):
    id: int
    name: str
    short_name: str
    initials: str
    scores: dict[str, float]


class WeakStudentRowOut(BaseModel):
    id: int
    full_name: str
    initials: str
    topics: list[str]
    topics_label: str
    avg_score: float


class TeacherDashboardOut(BaseModel):
    greeting_name: str
    date_label: str
    header_subtitle: str
    class_id: str
    class_name: str
    classes: list[dict]
    metrics: list[TeacherMetricOut]
    heatmap_topics: list[str]
    teaching_subjects: list[str] = Field(default_factory=list)
    heatmap_students: list[HeatmapStudentOut]
    weak_students: list[WeakStudentRowOut]
    nav_badges: dict[str, int] = Field(default_factory=dict)
    papers_pending_review: int = 0
    papers_distributed_count: int = 0
    assignments_pending_review: int
    ai_queue_count: int
    weak_topics: list[WeakTopicRow]
    at_risk_students: list[AtRiskStudent]
    students: list[dict]
    total_students: int


PaperExamType = Literal[
    "chapter_test",
    "unit_test",
    "half_yearly",
    "annual",
    "mcq_only",
    "practice_worksheet",
]


class PaperCreateIn(BaseModel):
    title: str = Field(min_length=1)
    subject: str = "Science"
    board: str = "CBSE"
    exam_type: PaperExamType = "chapter_test"
    ncert_class: str | None = None
    chapter_scope: dict | None = None
    blueprint: dict | None = None
    sections: dict | None = None
    total_marks: int = Field(default=0, ge=0, le=500)
    duration_mins: int = Field(default=60, ge=5, le=360)
    instructions: str | None = None


class PaperUpdateIn(BaseModel):
    title: str | None = None
    subject: str | None = None
    board: str | None = None
    exam_type: PaperExamType | None = None
    ncert_class: str | None = None
    chapter_scope: dict | None = None
    blueprint: dict | None = None
    sections: dict | None = None
    total_marks: int | None = Field(default=None, ge=0, le=500)
    duration_mins: int | None = Field(default=None, ge=5, le=360)
    instructions: str | None = None
    pdf_storage_key: str | None = None
    status: Literal["draft", "published"] | None = None


class PaperOut(BaseModel):
    id: int
    teacher_id: int
    title: str
    subject: str | None = None
    board: str
    exam_type: str | None = None
    ncert_class: str | None = None
    chapter_scope: dict | None = None
    blueprint: dict | None = None
    sections: dict | None = None
    total_marks: int
    duration_mins: int
    instructions: str | None = None
    pdf_storage_key: str | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class PaperDeleteOut(BaseModel):
    deleted: bool = True
    paper_id: int
    distributions_removed: int = 0
    events_removed: int = 0
    attempts_removed: int = 0
    written_removed: int = 0


class PaperGenerateSlotIn(BaseModel):
    section_id: str = Field(min_length=1)
    section_type: str = Field(default="mcq")
    count: int = Field(ge=1, le=MAX_NCERT_QUIZ_GENERATE_QUESTIONS)


class GeneratePaperFromNcertIn(BaseModel):
    chapter_label: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    kb_name: str | None = None  # resolved to ncert-class-{N}-{subject} if omitted
    pdf_url: str | None = None
    count: int = Field(default=5, ge=1)
    ncert_class: str | None = None
    exam_type: PaperExamType = "chapter_test"
    section_id: str | None = None
    section_type: str | None = None
    slots: list[PaperGenerateSlotIn] | None = None

    def resolved_kb_name(self) -> str:
        """Derive the best KB name from class + subject if not explicitly set."""
        if self.kb_name:
            return self.kb_name
        n = (self.ncert_class or "").replace("class-", "").strip()
        subj = self.subject.lower().replace(" ", "-") if self.subject else ""
        if n and subj:
            return f"ncert-class-{n}-{subj}"
        if n:
            return f"ncert-class-{n}"
        return "ncert-class-8"


class GeneratePaperFromNcertOut(BaseModel):
    success: bool
    questions: list[dict] = Field(default_factory=list)
    requested: int = 0
    completed: int = 0
    failed: int = 0
    duration_secs: float | None = None
    stage_times: dict[str, float] | None = None
    error: str | None = None


class PaperDistributionCreateIn(BaseModel):
    paper_id: int
    class_id: str = "class-8a"
    due_at: datetime
    instructions: str | None = None
    allow_download: bool = True
    allow_online_practice: bool = False
    allow_online_exam: bool = False
    allow_written_submission: bool = False
    title: str | None = None


class PaperDistributionOut(BaseModel):
    id: str
    paper_id: int
    teacher_id: int
    class_id: str
    title: str
    due_at: datetime
    instructions: str | None = None
    allow_download: bool
    allow_online_practice: bool
    allow_online_exam: bool = False
    allow_written_submission: bool = False
    created_at: datetime
    due_label: str
    pending_grade_count: int = 0

    class Config:
        from_attributes = True


class PaperDistributionStudentRowOut(BaseModel):
    student_id: int
    full_name: str
    roll_no: str | None = None
    viewed: bool = False
    downloaded: bool = False
    practice_started: bool = False
    practice_submitted: bool = False
    exam_submitted: bool = False
    written_submitted: bool = False
    written_submission_id: str | None = None
    attempt_id: str | None = None
    practice_attempt_id: str | None = None
    score: float | None = None
    max_score: float | None = None
    ai_score: float | None = None
    teacher_score: float | None = None
    grading_status: str | None = None
    progress_label: str = "Not started"
    last_event_at: datetime | None = None


class PaperDistributionSummaryOut(BaseModel):
    student_count: int = 0
    viewed_count: int = 0
    downloaded_count: int = 0
    submitted_count: int = 0
    graded_count: int = 0
    pending_grade_count: int = 0
    distribution_mode: str = "other"
    distribution_mode_label: str = "Paper"


class PaperDistributionDetailOut(BaseModel):
    distribution: PaperDistributionOut
    students: list[PaperDistributionStudentRowOut]
    summary: PaperDistributionSummaryOut


class StudentPaperOut(BaseModel):
    distribution_id: str
    paper_id: int
    title: str
    subject: str | None = None
    board: str
    exam_type: str | None = None
    total_marks: int
    duration_mins: int
    due_at: datetime
    due_label: str
    status: Literal["new", "downloaded", "overdue", "completed"]
    allow_download: bool
    allow_online_practice: bool
    allow_online_exam: bool = False
    allow_written_submission: bool = False
    submission_mode: str = "other"
    submission_mode_label: str = "Paper"
    progress_label: str = "Not started"
    chapter_label: str | None = None
    teacher_name: str | None = None
    last_score: float | None = None
    last_max_score: float | None = None
    last_percentage: float | None = None


class StudentPaperDetailOut(BaseModel):
    distribution_id: str
    paper_id: int
    title: str
    subject: str | None = None
    board: str
    exam_type: str | None = None
    total_marks: int
    duration_mins: int
    due_at: datetime
    due_label: str
    allow_download: bool
    allow_online_practice: bool
    allow_online_exam: bool = False
    allow_written_submission: bool = False
    instructions: str | None = None
    sections: dict | None = None
    chapter_scope: dict | None = None
    has_downloaded: bool = False
    written_status: Literal["not_started", "submitted", "graded"] = "not_started"
    progress_label: str | None = None


class PaperWrittenFileOut(BaseModel):
    url: str
    filename: str
    uploaded_at: datetime | None = None


class PaperWrittenStatusOut(BaseModel):
    submission_id: str | None = None
    status: Literal["not_started", "draft", "submitted", "graded"] = "not_started"
    files: list[PaperWrittenFileOut] = Field(default_factory=list)
    teacher_score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    submitted_at: datetime | None = None


class PaperWrittenSubmitOut(BaseModel):
    submission_id: str
    status: str
    file_count: int


class PaperWrittenResultOut(BaseModel):
    submission_id: str
    distribution_id: str
    teacher_score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    status: str
    items: list[dict] = Field(default_factory=list)
    files: list[PaperWrittenFileOut] = Field(default_factory=list)
    submitted_at: datetime | None = None
    graded_at: datetime | None = None


class PaperExamStartOut(BaseModel):
    attempt_id: str
    distribution_id: str
    paper_id: int
    questions: list[dict] = Field(default_factory=list)
    duration_mins: int
    started_at: datetime
    saved_answers: list[dict] = Field(default_factory=list)


class PaperExamSubmitIn(BaseModel):
    answers: list[AnswerItemIn]


class PaperExamSubmitOut(BaseModel):
    attempt_id: str
    ai_score: float
    max_score: float
    percentage: float
    grading_status: str
    requires_teacher_review: bool = False
    items: list[dict] = Field(default_factory=list)


class PaperExamResultOut(BaseModel):
    attempt_id: str
    distribution_id: str
    ai_score: float | None = None
    teacher_score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    grading_status: str
    requires_teacher_review: bool = False
    items: list[dict] = Field(default_factory=list)
    submitted_at: datetime | None = None


class TeacherExamGradeItemIn(BaseModel):
    question_id: str
    teacher_marks: float | None = None
    teacher_comment: str | None = None


class TeacherExamGradeIn(BaseModel):
    items: list[TeacherExamGradeItemIn] = Field(default_factory=list)
    finalize: bool = False


class PaperPracticeReviewItemOut(BaseModel):
    question_id: str
    section_id: str | None = None
    type: str | None = "mcq"
    question_text: str | None = None
    max_marks: float | None = None
    student_answer: str = ""
    correct_answer: str | None = None
    is_correct: bool = False
    marks_awarded: float | None = None
    feedback: str | None = None


class TeacherPracticeAttemptDetailOut(BaseModel):
    attempt_id: str
    distribution_id: str
    distribution_title: str
    student_id: int
    student_name: str
    score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    submitted_at: datetime | None = None
    items: list[PaperPracticeReviewItemOut] = Field(default_factory=list)


class TeacherWrittenSubmissionDetailOut(BaseModel):
    submission_id: str
    distribution_id: str
    distribution_title: str
    student_id: int
    student_name: str
    teacher_score: float | None = None
    max_score: float | None = None
    status: str
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    files: list[PaperWrittenFileOut] = Field(default_factory=list)
    items: list[dict] = Field(default_factory=list)


class PaperPracticeStartOut(BaseModel):
    attempt_id: str
    distribution_id: str
    paper_id: int
    questions: list[dict] = Field(default_factory=list)
    duration_mins: int
    started_at: datetime
    saved_answers: list[dict] = Field(default_factory=list)


class PaperPracticeSubmitIn(BaseModel):
    answers: list[AnswerItemIn]


class PaperPracticeSubmitOut(BaseModel):
    attempt_id: str
    score: float
    max_score: float
    percentage: float
    status: str
    feedback: dict[str, str] = Field(default_factory=dict)


class ExamCalendarSlotChapterIn(BaseModel):
    chapter_key: str = Field(min_length=1)
    chapter_label: str = Field(min_length=1)
    ncert_class: str | None = None
    pdf_url: str | None = None


class ExamCalendarSlotChapterOut(ExamCalendarSlotChapterIn):
    id: int


class ExamCalendarSlotIn(BaseModel):
    id: str | None = None
    sort_order: int = Field(ge=1)
    slot_type: str = Field(default="unit_test")
    title: str = Field(min_length=1, max_length=255)
    exam_date: datetime | None = None
    marks: int | None = Field(default=None, ge=0)
    duration_mins: int | None = Field(default=None, ge=1)
    instructions: str | None = None
    chapters: list[ExamCalendarSlotChapterIn] = Field(default_factory=list)


class ExamCalendarSlotOut(BaseModel):
    id: str
    sort_order: int
    slot_type: str
    title: str
    exam_date: datetime | None = None
    marks: int | None = None
    duration_mins: int | None = None
    instructions: str | None = None
    linked_paper_id: int | None = None
    linked_assignment_id: str | None = None
    linked_distribution_id: str | None = None
    chapters: list[ExamCalendarSlotChapterOut] = Field(default_factory=list)


class ExamCalendarSummaryOut(BaseModel):
    id: str
    class_id: str
    subject: str
    academic_year: str
    template_id: str
    status: str
    slot_count: int = 0
    published_at: datetime | None = None
    updated_at: datetime | None = None


class ExamCalendarOut(BaseModel):
    id: str
    class_id: str
    subject: str
    academic_year: str
    template_id: str
    status: str
    slots: list[ExamCalendarSlotOut] = Field(default_factory=list)
    overlap_warnings: list[str] = Field(default_factory=list)
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExamCalendarCreateIn(BaseModel):
    class_id: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    academic_year: str | None = None
    template_id: str = Field(default="standard_6")


class ExamCalendarPatchIn(BaseModel):
    class_id: str | None = None
    subject: str | None = None
    academic_year: str | None = None
    template_id: str | None = None


class ExamCalendarSlotsPutIn(BaseModel):
    slots: list[ExamCalendarSlotIn] = Field(default_factory=list)


class ExamCalendarSlotLinkPaperIn(BaseModel):
    paper_id: int = Field(ge=1)


class ExamCalendarSlotLinkAssignmentIn(BaseModel):
    assignment_id: str = Field(min_length=1)


class ExamCalendarCopyIn(BaseModel):
    class_id: str | None = None
    academic_year: str | None = None
    subject: str | None = None


class ExamCalendarPublishOut(BaseModel):
    ok: bool
    errors: list[str] = Field(default_factory=list)
    calendar: ExamCalendarOut | None = None


class ExamCalendarUpcomingSlotOut(BaseModel):
    calendar_id: str
    slot_id: str
    title: str
    subject: str
    exam_date: datetime | None = None
    chapter_summary: str
    slot_type: str
    linked_paper_id: int | None = None
    linked_distribution_id: str | None = None


class ExamCalendarUpcomingOut(BaseModel):
    slots: list[ExamCalendarUpcomingSlotOut] = Field(default_factory=list)


class StudentExamCalendarOut(BaseModel):
    calendars: list[ExamCalendarOut] = Field(default_factory=list)


StudentDashboardOut.model_rebuild()
