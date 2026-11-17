"""Analytics engine API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import TopicProficiency, User
from src.lms.services.at_risk import detect_at_risk_students
from src.lms.services.classes import safe_resolve_class_id

router = APIRouter(prefix="/api/analytics", tags=["lms-analytics"])


@router.get("/weak-topics")
def weak_topics(
    class_id: str | None = Query(None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    # Teachers only see analytics for classes they are mapped to (via safe_resolve_class_id).
    cid = safe_resolve_class_id(db, class_id, user)
    if not cid:
        return []
    rows = (
        db.query(TopicProficiency)
        .join(User, User.id == TopicProficiency.student_id)
        .filter(User.class_id == cid)
        .all()
    )
    agg: dict[str, list[float]] = {}
    for r in rows:
        agg.setdefault(r.topic, []).append(r.score)
    return [
        {
            "topic": t,
            "avg": round(sum(v) / len(v), 1),
            "remediation": f"Review {t} with visual aids and practice set.",
        }
        for t, v in sorted(agg.items(), key=lambda x: sum(x[1]) / len(x[1]))[:10]
    ]


@router.get("/topic-matrix")
def topic_matrix(
    class_id: str | None = Query(None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    cid = safe_resolve_class_id(db, class_id, user)
    if not cid:
        return {"topics": [], "rows": []}
    students = (
        db.query(User)
        .filter(User.role == "student", User.class_id == cid)
        .all()
    )
    topics = sorted(
        {r.topic for r in db.query(TopicProficiency.topic).distinct().all()}
    )
    matrix = []
    for s in students:
        profs = {
            p.topic: p.score
            for p in db.query(TopicProficiency)
            .filter(TopicProficiency.student_id == s.id)
            .all()
        }
        matrix.append(
            {
                "student_id": s.id,
                "student_name": s.full_name,
                "scores": {t: profs.get(t, 0) for t in topics},
            }
        )
    return {"topics": topics, "rows": matrix}


@router.get("/heatmap")
def heatmap_export(
    student_id: int | None = None,
    user: User = Depends(require_roles("student", "teacher", "admin")),
    db: Session = Depends(get_db),
):
    sid = student_id or (user.id if user.role == "student" else None)
    if not sid:
        return {"cells": []}
    rows = (
        db.query(TopicProficiency)
        .filter(TopicProficiency.student_id == sid)
        .all()
    )
    return {
        "cells": [
            {"topic": r.topic, "subject": r.subject, "score": r.score}
            for r in rows
        ],
        "export_hint": "Use frontend html2canvas for PNG; CSV from cells array.",
    }


@router.get("/at-risk")
def at_risk_list(
    class_id: str | None = Query(None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    cid = safe_resolve_class_id(db, class_id, user)
    if not cid:
        return []
    return detect_at_risk_students(db, cid)
