"""LMS database engine — PostgreSQL via DATABASE_URL; runs admin foundation migrations on init."""

import os
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_root / ".env", override=False)
load_dotenv(_project_root / "bixy_AiTutor.env", override=False)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Set in .env, e.g.\n"
        "DATABASE_URL=postgresql+psycopg2://AiTutor:aitutor123@localhost:5432/AiTutor"
    )

if DATABASE_URL.startswith("sqlite"):
    raise RuntimeError(
        "SQLite is disabled for LMS. Use PostgreSQL in DATABASE_URL."
    )

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _repair_assignment_created_at_order(insp) -> None:
    """
    Legacy rows used due_at as created_at, which breaks newest-first sorting.
    Re-stamp created_at in stable id order so newer assignment ids sort on top.
    """
    from sqlalchemy import text

    if "assignments" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("assignments")}
    if "created_at" not in cols:
        return

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                "SELECT id FROM assignments "
                "WHERE created_at = due_at ORDER BY id ASC"
            )
        ).fetchall()
        if not rows:
            return
        base = datetime.utcnow() - timedelta(days=max(len(rows), 1))
        for i, (aid,) in enumerate(rows):
            ts = base + timedelta(seconds=i + 1)
            conn.execute(
                text("UPDATE assignments SET created_at = :ts WHERE id = :id"),
                {"ts": ts, "id": aid},
            )


def _migrate_p0_columns() -> None:
    """Add Phase-0 columns on existing PostgreSQL DBs (create_all skips alters)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "assignments" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("assignments")}
        with engine.begin() as conn:
            if "teacher_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE assignments "
                        "ADD COLUMN teacher_id INTEGER REFERENCES users(id)"
                    )
                )
            if "subject" not in cols:
                conn.execute(
                    text("ALTER TABLE assignments ADD COLUMN subject VARCHAR(64)")
                )
            if "instructions" not in cols:
                conn.execute(
                    text("ALTER TABLE assignments ADD COLUMN instructions TEXT")
                )
            if "created_at" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE assignments "
                        "ADD COLUMN created_at TIMESTAMP WITHOUT TIME ZONE"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE assignments SET created_at = due_at "
                        "WHERE created_at IS NULL"
                    )
                )

    _repair_assignment_created_at_order(insp)

    if "quizzes" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("quizzes")}
        with engine.begin() as conn:
            if "ncert_class" not in cols:
                conn.execute(text("ALTER TABLE quizzes ADD COLUMN ncert_class VARCHAR(32)"))
            if "chapter_label" not in cols:
                conn.execute(text("ALTER TABLE quizzes ADD COLUMN chapter_label VARCHAR(512)"))
            if "kb_name" not in cols:
                conn.execute(text("ALTER TABLE quizzes ADD COLUMN kb_name VARCHAR(64)"))
            if "pdf_url" not in cols:
                conn.execute(text("ALTER TABLE quizzes ADD COLUMN pdf_url VARCHAR(512)"))

    if "quiz_attempts" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("quiz_attempts")}
        with engine.begin() as conn:
            for col, ddl in (
                ("answers_json", "JSON"),
                ("feedback_json", "JSON"),
                ("marked_for_review", "JSON"),
            ):
                if col not in cols:
                    conn.execute(
                        text(f"ALTER TABLE quiz_attempts ADD COLUMN {col} {ddl}")
                    )

    if "question_papers" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("question_papers")}
        with engine.begin() as conn:
            additions = (
                ("subject", "VARCHAR(64)"),
                ("exam_type", "VARCHAR(64)"),
                ("ncert_class", "VARCHAR(32)"),
                ("chapter_scope", "JSON"),
                ("total_marks", "INTEGER DEFAULT 0"),
                ("duration_mins", "INTEGER DEFAULT 60"),
                ("instructions", "TEXT"),
                ("pdf_storage_key", "VARCHAR(512)"),
                ("updated_at", "TIMESTAMP WITHOUT TIME ZONE"),
            )
            for col, ddl in additions:
                if col not in cols:
                    conn.execute(
                        text(f"ALTER TABLE question_papers ADD COLUMN {col} {ddl}")
                    )

            if "board" in cols:
                conn.execute(
                    text(
                        "UPDATE question_papers SET board = 'CBSE' "
                        "WHERE board IS NULL OR board = ''"
                    )
                )

            conn.execute(
                text(
                    "UPDATE question_papers SET total_marks = COALESCE(total_marks, 0), "
                    "duration_mins = COALESCE(duration_mins, 60), "
                    "updated_at = COALESCE(updated_at, created_at, NOW())"
                )
            )

    if "paper_distributions" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("paper_distributions")}
        with engine.begin() as conn:
            if "allow_online_exam" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE paper_distributions "
                        "ADD COLUMN allow_online_exam BOOLEAN DEFAULT FALSE"
                    )
                )
            if "allow_written_submission" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE paper_distributions "
                        "ADD COLUMN allow_written_submission BOOLEAN DEFAULT FALSE"
                    )
                )

    if "paper_practice_attempts" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("paper_practice_attempts")}
        with engine.begin() as conn:
            additions = (
                ("attempt_type", "VARCHAR(32) DEFAULT 'mcq_practice'"),
                ("grading_json", "JSON"),
                ("ai_score", "DOUBLE PRECISION"),
                ("teacher_score", "DOUBLE PRECISION"),
                ("max_score", "DOUBLE PRECISION"),
                ("grading_status", "VARCHAR(32) DEFAULT 'in_progress'"),
            )
            for col, ddl in additions:
                if col not in cols:
                    conn.execute(
                        text(f"ALTER TABLE paper_practice_attempts ADD COLUMN {col} {ddl}")
                    )


def _migrate_admin_foundation() -> None:
    """Schools table + admin scoping columns for existing PostgreSQL DBs."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    tables = set(insp.get_table_names())

    with engine.begin() as conn:
        if "schools" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE schools (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        board VARCHAR(64) DEFAULT 'CBSE',
                        address VARCHAR(512),
                        academic_year VARCHAR(16) DEFAULT '2025-26',
                        logo_url VARCHAR(512),
                        settings JSON,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
                    )
                    """
                )
            )

        if "users" in tables:
            cols = {c["name"] for c in insp.get_columns("users")}
            if "school_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN school_id VARCHAR(64) "
                        "REFERENCES schools(id)"
                    )
                )
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_users_school_id ON users (school_id)")
                )
            cols = {c["name"] for c in insp.get_columns("users")}
            if "password_plain" not in cols:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN password_plain VARCHAR(128)")
                )

        if "class_sections" in tables:
            cols = {c["name"] for c in insp.get_columns("class_sections")}
            additions = (
                ("join_code", "VARCHAR(32)"),
                ("academic_year", "VARCHAR(16)"),
                ("is_active", "BOOLEAN DEFAULT TRUE"),
            )
            for col, ddl in additions:
                if col not in cols:
                    conn.execute(
                        text(f"ALTER TABLE class_sections ADD COLUMN {col} {ddl}")
                    )
            # school_id may exist without FK on legacy DBs
            cols = {c["name"] for c in insp.get_columns("class_sections")}
            if "school_id" in cols:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_class_sections_school_id "
                        "ON class_sections (school_id)"
                    )
                )
            grade_col = next(
                (c for c in insp.get_columns("class_sections") if c["name"] == "grade"),
                None,
            )
            if grade_col and grade_col.get("nullable") is False:
                conn.execute(
                    text("ALTER TABLE class_sections ALTER COLUMN grade DROP NOT NULL")
                )
            section_col = next(
                (c for c in insp.get_columns("class_sections") if c["name"] == "section"),
                None,
            )
            if section_col and section_col.get("nullable") is False:
                conn.execute(
                    text("ALTER TABLE class_sections ALTER COLUMN section DROP NOT NULL")
                )

        if "class_teacher_subjects" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE class_teacher_subjects (
                        id SERIAL PRIMARY KEY,
                        teacher_id INTEGER NOT NULL REFERENCES users(id),
                        class_id VARCHAR(64) NOT NULL,
                        subject VARCHAR(64) NOT NULL,
                        academic_year VARCHAR(16) DEFAULT '2025-26',
                        school_id VARCHAR(64) REFERENCES schools(id),
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_cts_teacher_id "
                    "ON class_teacher_subjects (teacher_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_cts_class_id "
                    "ON class_teacher_subjects (class_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_cts_school_id "
                    "ON class_teacher_subjects (school_id)"
                )
            )


def init_db():
    from src.lms import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_p0_columns()
    _migrate_admin_foundation()  # schools table, school_id FKs, class_teacher_subjects
