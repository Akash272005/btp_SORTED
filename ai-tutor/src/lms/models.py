"""LMS SQLAlchemy models — includes School tenant and admin foundation tables."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.lms.db import Base

DEMO_SCHOOL_ID = "school-vidyasetu-demo"


class School(Base):
    """Tenant school record for multi-school admin scoping."""

    __tablename__ = "schools"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    board: Mapped[str] = mapped_column(String(64), default="CBSE")
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    academic_year: Mapped[str] = mapped_column(String(16), default="2025-26")
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class User(Base):
    """Portal account — student, teacher, or school admin; scoped via school_id."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_plain: Mapped[str | None] = mapped_column(String(128), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32))  # student | teacher | admin
    grade: Mapped[str | None] = mapped_column(String(32), nullable=True)
    roll_no: Mapped[str | None] = mapped_column(String(32), nullable=True)
    class_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    school_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("schools.id"), nullable=True, index=True
    )
    google_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    avatar_initials: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ClassSection(Base):
    """School class section (e.g. Class 8-A). Referenced by users.class_id and assignments."""

    __tablename__ = "class_sections"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    grade: Mapped[str] = mapped_column(String(32))
    section: Mapped[str | None] = mapped_column(String(8), nullable=True)
    school_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("schools.id"), nullable=True, index=True
    )
    join_code: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    academic_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ClassTeacherSubject(Base):
    """Maps a teacher to a class and subject for the academic year."""

    __tablename__ = "class_teacher_subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(64))
    academic_year: Mapped[str] = mapped_column(String(16), default="2025-26")
    school_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("schools.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(64), default="General")
    questions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    duration_mins: Mapped[int] = mapped_column(Integer, default=30)
    total_marks: Mapped[int] = mapped_column(Integer, default=10)
    ncert_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    chapter_label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    kb_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    quiz_id: Mapped[str] = mapped_column(String(64), index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, default=100)
    status: Mapped[str] = mapped_column(String(32), default="in_progress")
    variant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    answers_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    feedback_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    marked_for_review: Mapped[list | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReattemptPolicy(Base):
    __tablename__ = "reattempt_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quiz_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1)
    unlock_mode: Mapped[str] = mapped_column(String(32), default="immediate")
    delay_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    generate_new_variant: Mapped[bool] = mapped_column(Boolean, default=False)


class TopicProficiency(Base):
    __tablename__ = "topic_proficiency"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    topic: Mapped[str] = mapped_column(String(128), index=True)
    subject: Mapped[str] = mapped_column(String(64), index=True)
    score: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TeacherReviewQueue(Base):
    __tablename__ = "teacher_review_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    quiz_id: Mapped[str] = mapped_column(String(64))
    question_id: Mapped[str] = mapped_column(String(64))
    answer_text: Mapped[str] = mapped_column(Text)
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exam_date: Mapped[datetime] = mapped_column(DateTime)
    daily_hours: Mapped[float] = mapped_column(Float, default=2)
    skip_days: Mapped[str | None] = mapped_column(String(64), nullable=True)
    weak_topics: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_with_teacher: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StudyPlanTask(Base):
    __tablename__ = "study_plan_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("study_plans.id"), index=True)
    task_date: Mapped[datetime] = mapped_column(DateTime, index=True)
    title: Mapped[str] = mapped_column(String(255))
    task_type: Mapped[str] = mapped_column(String(32))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)


class AtRiskLog(Base):
    __tablename__ = "at_risk_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    subjects: Mapped[str] = mapped_column(Text)
    avg_score: Mapped[float] = mapped_column(Float)
    weeks_below: Mapped[int] = mapped_column(Integer, default=2)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class QuestionPaper(Base):
    __tablename__ = "question_papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(String(64), nullable=True)
    board: Mapped[str] = mapped_column(String(64), default="CBSE")
    exam_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ncert_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    chapter_scope: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    blueprint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sections: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    total_marks: Mapped[int] = mapped_column(Integer, default=0)
    duration_mins: Mapped[int] = mapped_column(Integer, default=60)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PaperDistribution(Base):
    __tablename__ = "paper_distributions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("question_papers.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    due_at: Mapped[datetime] = mapped_column(DateTime)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_online_practice: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_online_exam: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_written_submission: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PaperWrittenSubmission(Base):
    __tablename__ = "paper_written_submissions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    distribution_id: Mapped[str] = mapped_column(
        ForeignKey("paper_distributions.id"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    files_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    grading_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    teacher_score: Mapped[float | None] = mapped_column(nullable=True)
    max_score: Mapped[float | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="submitted")
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PaperStudentEvent(Base):
    __tablename__ = "paper_student_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    distribution_id: Mapped[str] = mapped_column(
        ForeignKey("paper_distributions.id"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PaperPracticeAttempt(Base):
    __tablename__ = "paper_practice_attempts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    distribution_id: Mapped[str] = mapped_column(
        ForeignKey("paper_distributions.id"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    attempt_type: Mapped[str] = mapped_column(String(32), default="mcq_practice")
    answers_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    grading_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_score: Mapped[float | None] = mapped_column(nullable=True)
    teacher_score: Mapped[float | None] = mapped_column(nullable=True)
    max_score: Mapped[float | None] = mapped_column(nullable=True)
    grading_status: Mapped[str] = mapped_column(String(32), default="in_progress")
    status: Mapped[str] = mapped_column(String(32), default="in_progress")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ExamCalendar(Base):
    __tablename__ = "exam_calendars"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(64), index=True)
    academic_year: Mapped[str] = mapped_column(String(16), index=True)
    template_id: Mapped[str] = mapped_column(String(32), default="standard_6")
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ExamCalendarSlot(Base):
    __tablename__ = "exam_calendar_slots"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    calendar_id: Mapped[str] = mapped_column(
        ForeignKey("exam_calendars.id", ondelete="CASCADE"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=1)
    slot_type: Mapped[str] = mapped_column(String(32), default="unit_test")
    title: Mapped[str] = mapped_column(String(255))
    exam_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    marks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_mins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    linked_paper_id: Mapped[int | None] = mapped_column(
        ForeignKey("question_papers.id"), nullable=True
    )
    linked_assignment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ExamCalendarSlotChapter(Base):
    __tablename__ = "exam_calendar_slot_chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slot_id: Mapped[str] = mapped_column(
        ForeignKey("exam_calendar_slots.id", ondelete="CASCADE"), index=True
    )
    chapter_key: Mapped[str] = mapped_column(String(128))
    chapter_label: Mapped[str] = mapped_column(String(512))
    ncert_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    teacher_name: Mapped[str] = mapped_column(String(128))
    teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    subject: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    class_id: Mapped[str] = mapped_column(String(64), index=True)
    marks: Mapped[int] = mapped_column(Integer, default=10)
    duration_mins: Mapped[int] = mapped_column(Integer, default=30)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    quiz_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    policy_id: Mapped[int | None] = mapped_column(ForeignKey("reattempt_policies.id"), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
