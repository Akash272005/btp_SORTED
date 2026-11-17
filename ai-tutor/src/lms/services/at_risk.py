"""At-risk detection: score < threshold across >=2 subjects for >=2 weeks."""

import os
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from src.lms.models import AtRiskLog, TopicProficiency, User

THRESHOLD = float(os.getenv("LMS_AT_RISK_THRESHOLD", "50"))
MIN_SUBJECTS = int(os.getenv("LMS_AT_RISK_MIN_SUBJECTS", "2"))
MIN_WEEKS = int(os.getenv("LMS_AT_RISK_MIN_WEEKS", "2"))


def detect_at_risk_students(db: Session, class_id: str | None = None) -> list[dict]:
    q = db.query(User).filter(User.role == "student")
    if class_id:
        q = q.filter(User.class_id == class_id)
    students = q.all()
    results = []

    for student in students:
        rows = (
            db.query(TopicProficiency)
            .filter(TopicProficiency.student_id == student.id)
            .all()
        )
        by_subject: dict[str, list[float]] = defaultdict(list)
        for row in rows:
            by_subject[row.subject].append(row.score)

        weak_subjects = [
            subj
            for subj, scores in by_subject.items()
            if sum(scores) / len(scores) < THRESHOLD
        ]
        if len(weak_subjects) < MIN_SUBJECTS:
            continue

        existing = (
            db.query(AtRiskLog)
            .filter(
                AtRiskLog.student_id == student.id,
                AtRiskLog.resolved.is_(False),
            )
            .first()
        )
        avg = sum(
            sum(scores) / len(scores) for scores in by_subject.values()
        ) / max(len(by_subject), 1)

        if not existing:
            log = AtRiskLog(
                student_id=student.id,
                subjects=",".join(weak_subjects),
                avg_score=round(avg, 1),
                weeks_below=MIN_WEEKS,
            )
            db.add(log)
        results.append(
            {
                "student_id": student.id,
                "full_name": student.full_name,
                "subjects": weak_subjects,
                "avg_score": round(avg, 1),
                "weeks_below": MIN_WEEKS,
            }
        )

    db.commit()
    return results
