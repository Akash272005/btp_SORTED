"""Generate printable question paper PDFs for students (questions + marks, no answers)."""

from __future__ import annotations

import re
from pathlib import Path

import fitz

from src.lms.models import QuestionPaper

PAGE_W = 595
PAGE_H = 842
MARGIN_L = 50
MARGIN_R = 50
MARGIN_T = 50
MARGIN_B = 50
MARKS_COL_W = 72


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


def paper_pdf_path(paper_id: int) -> Path:
    root = _project_root() / "data" / "user" / "papers"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"paper_{paper_id}.pdf"


def paper_pdf_public_url(paper_id: int) -> str:
    return f"/api/outputs/papers/paper_{paper_id}.pdf"


def answer_key_pdf_path(paper_id: int) -> Path:
    root = _project_root() / "data" / "user" / "papers"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"paper_{paper_id}_answer_key.pdf"


def answer_key_pdf_public_url(paper_id: int) -> str:
    return f"/api/outputs/papers/paper_{paper_id}_answer_key.pdf"


def _sections_list(paper: QuestionPaper) -> list[dict]:
    if not isinstance(paper.sections, dict):
        return []
    raw = paper.sections.get("sections")
    return [s for s in (raw or []) if isinstance(s, dict)]


def _filled_questions(sec: dict) -> list[dict]:
    out: list[dict] = []
    for q in sec.get("questions") or []:
        if not isinstance(q, dict):
            continue
        if str(q.get("text") or "").strip():
            out.append(q)
    return out


def count_filled_questions(paper: QuestionPaper) -> int:
    return sum(len(_filled_questions(s)) for s in _sections_list(paper))


_PUBLISH_MARK_TOLERANCE = 0.25


def paper_publish_validation_error(paper: QuestionPaper) -> str | None:
    """Return a user-facing error if the paper must not be published yet."""
    sections = _sections_list(paper)
    all_questions: list[dict] = []
    for sec in sections:
        for q in sec.get("questions") or []:
            if isinstance(q, dict):
                all_questions.append(q)
    if not all_questions:
        return "Add at least one question before publishing."
    filled = [q for q in all_questions if str(q.get("text") or "").strip()]
    if not filled:
        return "Add at least one question before publishing."
    if len(filled) < len(all_questions):
        return "Fill every question slot in the blueprint before publishing."
    slot_marks = round(
        sum(float(q.get("marks") or 0) for q in all_questions),
        2,
    )
    target = float(paper.total_marks or 0)
    if abs(slot_marks - target) > _PUBLISH_MARK_TOLERANCE:
        return (
            f"Question marks total ({slot_marks:g}) must match "
            f"paper total ({target:g})."
        )
    return None


def _mcq_option_letter(index: int) -> str:
    if 0 <= index < 26:
        return chr(65 + index)
    return str(index + 1)


def _format_mcq_answer_display(options: list[str], correct_answer: str | None) -> str:
    raw = (correct_answer or "").strip()
    if not raw:
        return "—"
    normalized = [str(o).strip() for o in options]
    for i, opt in enumerate(normalized):
        if opt and opt == raw:
            return f"({_mcq_option_letter(i)}) {raw}"
    m = re.match(r"^([A-Za-z])[.)]?\s*(.*)$", raw)
    if m:
        letter = m.group(1).upper()
        idx = ord(letter) - 65 if len(letter) == 1 and letter.isalpha() else -1
        if 0 <= idx < len(normalized) and normalized[idx]:
            body = (m.group(2) or "").strip() or normalized[idx]
            return f"({letter}) {body}"
    return raw


def _line_height(fontsize: float) -> float:
    return fontsize * 1.35


def _wrap_lines_in_paragraph(
    paragraph: str,
    width: float,
    fontsize: float,
    *,
    fontname: str = "helv",
) -> int:
    """Count wrapped lines for one paragraph (no embedded newlines)."""
    words = paragraph.split()
    if not words:
        return 1
    lines = 1
    line_w = 0.0
    space_w = fitz.get_text_length(" ", fontname=fontname, fontsize=fontsize)
    for word in words:
        ww = fitz.get_text_length(word, fontname=fontname, fontsize=fontsize)
        needed = ww if line_w <= 0 else space_w + ww
        if line_w > 0 and line_w + needed > width:
            lines += 1
            line_w = ww
        else:
            line_w = ww if line_w <= 0 else line_w + needed
    return lines


def _wrap_height(
    text: str,
    width: float,
    fontsize: float,
    *,
    fontname: str = "helv",
) -> float:
    """Estimate vertical space for word-wrapped plain text (incl. explicit newlines)."""
    t = text.strip()
    if not t or width <= 0:
        return _line_height(fontsize) + 4
    lh = _line_height(fontsize)
    total_lines = 0
    for para in t.split("\n"):
        if not para.strip():
            total_lines += 1
        else:
            total_lines += _wrap_lines_in_paragraph(para, width, fontsize, fontname=fontname)
    return max(total_lines, 1) * lh + 6


def _pdf_plain_text(text: str) -> str:
    """Map Unicode that standard PDF fonts cannot render (shows as '?')."""
    out = str(text)
    for src, dst in (
        ("\u2010", "-"),
        ("\u2011", "-"),
        ("\u2012", "-"),
        ("\u2013", "-"),
        ("\u2014", "-"),
        ("\u2212", "-"),
        ("\u00ad", ""),
        ("\u2192", "->"),
        ("\u2190", "<-"),
        ("\u00b0", " deg"),
        ("\u00b7", " "),
    ):
        out = out.replace(src, dst)
    for i, ch in enumerate("₀₁₂₃₄₅₆₇₈₉"):
        out = out.replace(ch, str(i))
    for i, ch in enumerate("⁰¹²³⁴⁵⁶⁷⁸⁹"):
        out = out.replace(ch, str(i))
    return out


def _format_marks(marks: object) -> str:
    try:
        val = float(marks)
    except (TypeError, ValueError):
        val = 1.0
    label = str(int(val)) if val == int(val) else f"{val:.1f}"
    unit = "mark" if label == "1" else "marks"
    return f"[{label} {unit}]"


class _PdfWriter:
    def __init__(self, doc: fitz.Document) -> None:
        self.doc = doc
        self.page = doc.new_page(width=PAGE_W, height=PAGE_H)
        self.y = float(MARGIN_T)

    def _new_page(self) -> None:
        self.page = self.doc.new_page(width=PAGE_W, height=PAGE_H)
        self.y = float(MARGIN_T)

    def _ensure(self, needed: float) -> None:
        if self.y + needed > PAGE_H - MARGIN_B:
            self._new_page()

    def line(self, text: str, *, size: float = 11, bold: bool = False, gap: float = 6) -> None:
        self._ensure(size + gap + 4)
        font = "hebo" if bold else "helv"
        self.page.insert_text((MARGIN_L, self.y + size), text, fontsize=size, fontname=font)
        self.y += size + gap

    def gap(self, amount: float = 10) -> None:
        self.y += amount

    def _insert_textbox(
        self,
        x0: float,
        top: float,
        width: float,
        text: str,
        *,
        size: float,
        font: str,
    ) -> float:
        """Draw wrapped text once; return vertical space used (points)."""
        est = _wrap_height(text, width, size, fontname=font)
        box_h = max(est * 1.06 + 4, size + 6)
        max_h = PAGE_H - MARGIN_B - top - 12
        box_h = min(box_h, max_h)

        rect = fitz.Rect(x0, top, x0 + width, top + box_h)
        rc = self.page.insert_textbox(
            rect,
            text,
            fontsize=size,
            fontname=font,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        if rc < 0:
            box_h = min(box_h + abs(rc) + 8, max_h)
            rect = fitz.Rect(x0, top, x0 + width, top + box_h)
            rc = self.page.insert_textbox(
                rect,
                text,
                fontsize=size,
                fontname=font,
                align=fitz.TEXT_ALIGN_LEFT,
            )
        if rc >= 0:
            return max(box_h - rc, size + 2)
        return max(est, size + 4)

    def _content_width(self, indent: float = 0, *, reserve_marks: bool = False) -> float:
        right = PAGE_W - MARGIN_R - (MARKS_COL_W if reserve_marks else 0)
        return max(80.0, right - MARGIN_L - indent)

    def draw_wrapped(
        self,
        text: str,
        *,
        size: float = 10,
        bold: bool = False,
        indent: float = 0,
        gap: float = 4,
        reserve_marks: bool = False,
    ) -> float:
        """Word-wrap text to page width; advance self.y. Returns height used."""
        text = _pdf_plain_text(text)
        font = "hebo" if bold else "helv"
        width = self._content_width(indent, reserve_marks=reserve_marks)
        x0 = MARGIN_L + indent
        est = _wrap_height(text, width, size, fontname=font) * 1.06 + 8
        self._ensure(est + gap + 4)
        top = self.y
        used = self._insert_textbox(x0, top, width, text, size=size, font=font)
        self.y = top + used + gap
        return used

    def draw_question_text(
        self,
        number: int,
        text: str,
        marks_label: str,
        *,
        size: float = 11,
    ) -> None:
        """Wrapped question stem with marks label in the right column."""
        body = _pdf_plain_text(f"{number}. {text}")
        width = self._content_width(reserve_marks=True)
        est = _wrap_height(body, width, size) * 1.06 + 10
        self._ensure(est + 8)
        top = self.y
        used = self._insert_textbox(MARGIN_L, top, width, body, size=size, font="helv")
        self.page.insert_text(
            (PAGE_W - MARGIN_R - MARKS_COL_W + 4, top + 11),
            marks_label,
            fontsize=10,
            fontname="helv",
            color=(0.35, 0.35, 0.35),
        )
        self.y = top + used + 6

    def question_block(
        self,
        number: int,
        text: str,
        marks_label: str,
        *,
        options: list[str] | None = None,
        q_type: str = "mcq",
    ) -> None:
        self.draw_question_text(number, text, marks_label)

        if options:
            for i, opt in enumerate(options):
                o = str(opt).strip()
                if not o:
                    continue
                label = _mcq_option_letter(i)
                self.draw_wrapped(f"({label}) {o}", size=10, indent=14, gap=3)
            self.gap(4)
        else:
            # Small separator only — large blank areas looked broken in the student PDF.
            self.gap(6)

    def answer_key_block(
        self,
        number: int,
        text: str,
        marks_label: str,
        *,
        options: list[str] | None = None,
        correct_answer: str | None = None,
        q_type: str = "mcq",
    ) -> None:
        self.draw_question_text(number, text, marks_label)

        if options:
            opts = [str(o).strip() for o in options if str(o).strip()]
            for i, o in enumerate(opts):
                label = _mcq_option_letter(i)
                self.draw_wrapped(f"({label}) {o}", size=10, indent=14, gap=3)
            if correct_answer:
                ans_line = _format_mcq_answer_display(opts, correct_answer)
                self.draw_wrapped(f"Answer: {ans_line}", size=10, bold=True, indent=14, gap=4)
        else:
            ans = (correct_answer or "").strip() or "—"
            self.draw_wrapped(f"Expected answer: {ans}", size=10, bold=True, indent=14, gap=4)
        self.gap(6)


def generate_question_paper_pdf(paper: QuestionPaper) -> str | None:
    """Build question paper PDF on disk. Returns public URL or None if no filled questions."""
    if count_filled_questions(paper) == 0:
        return None

    doc = fitz.open()
    w = _PdfWriter(doc)

    title = (paper.title or "Question Paper").strip()
    subject = (paper.subject or "General").strip()
    board = (paper.board or "CBSE").strip()
    ncert_class = (paper.ncert_class or "").strip()
    total = int(paper.total_marks or 0)
    duration = int(paper.duration_mins or 0)
    exam = (paper.exam_type or "").replace("_", " ").strip().title()

    w.line(title, size=16, bold=True, gap=8)
    class_line = f"Class {ncert_class} · {subject} · {board}" if ncert_class else f"{subject} · {board}"
    w.line(class_line, size=12, gap=6)
    if exam:
        w.line(exam, size=11, gap=6)
    w.line(f"Time allowed: {duration} minutes    Maximum marks: {total}", size=11, gap=10)
    w.line("Read all questions carefully.", size=10, gap=14)

    qnum = 0
    for sec in _sections_list(paper):
        filled = _filled_questions(sec)
        if not filled:
            continue
        sec_id = str(sec.get("id", ""))
        sec_type = str(sec.get("type", "")).upper()
        w.line(f"SECTION {sec_id} — {sec_type}", size=13, bold=True, gap=10)

        for q in filled:
            qnum += 1
            q_text = str(q.get("text", "")).strip()
            marks_label = _format_marks(q.get("marks", 1))
            q_type = str(q.get("type") or sec.get("type") or "short").lower()
            options = None
            if q_type == "mcq":
                raw_opts = q.get("options")
                if isinstance(raw_opts, list):
                    options = [str(o) for o in raw_opts if str(o).strip()]
            w.question_block(
                qnum,
                q_text,
                marks_label,
                options=options,
                q_type=q_type,
            )

        w.gap(12)

    out_path = paper_pdf_path(paper.id)
    doc.save(str(out_path))
    doc.close()
    return paper_pdf_public_url(paper.id)


def ensure_question_paper_pdf(paper: QuestionPaper) -> str | None:
    """Generate (or overwrite) the question paper PDF and return its public URL."""
    return generate_question_paper_pdf(paper)


def resolve_question_paper_pdf_url(paper: QuestionPaper) -> str | None:
    """Use cached generated PDF if present; otherwise build a new one."""
    if count_filled_questions(paper) == 0:
        return None
    path = paper_pdf_path(paper.id)
    stored = (paper.pdf_storage_key or "").strip()
    if path.exists() and stored.endswith(f"paper_{paper.id}.pdf"):
        return stored
    return ensure_question_paper_pdf(paper)


def generate_answer_key_pdf(paper: QuestionPaper) -> str | None:
    """Teacher-only PDF with questions and correct / model answers."""
    if count_filled_questions(paper) == 0:
        return None

    doc = fitz.open()
    w = _PdfWriter(doc)

    title = (paper.title or "Question Paper").strip()
    subject = (paper.subject or "General").strip()
    board = (paper.board or "CBSE").strip()
    ncert_class = (paper.ncert_class or "").strip()
    total = int(paper.total_marks or 0)
    duration = int(paper.duration_mins or 0)
    exam = (paper.exam_type or "").replace("_", " ").strip().title()

    w.line(f"{title} — Answer Key", size=16, bold=True, gap=8)
    w.line("TEACHER COPY — DO NOT DISTRIBUTE TO STUDENTS", size=10, bold=True, gap=8)
    class_line = f"Class {ncert_class} · {subject} · {board}" if ncert_class else f"{subject} · {board}"
    w.line(class_line, size=12, gap=6)
    if exam:
        w.line(exam, size=11, gap=6)
    w.line(f"Time allowed: {duration} minutes    Maximum marks: {total}", size=11, gap=12)

    qnum = 0
    for sec in _sections_list(paper):
        filled = _filled_questions(sec)
        if not filled:
            continue
        sec_id = str(sec.get("id", ""))
        sec_type = str(sec.get("type", "")).upper()
        w.line(f"SECTION {sec_id} — {sec_type}", size=13, bold=True, gap=10)

        for q in filled:
            qnum += 1
            q_text = str(q.get("text", "")).strip()
            marks_label = _format_marks(q.get("marks", 1))
            q_type = str(q.get("type") or sec.get("type") or "short").lower()
            answer = q.get("correct_answer")
            if answer is None:
                answer = q.get("model_answer")
            answer_str = str(answer).strip() if answer is not None else None
            options = None
            if q_type == "mcq":
                raw_opts = q.get("options")
                if isinstance(raw_opts, list):
                    options = [str(o) for o in raw_opts if str(o).strip()]
            w.answer_key_block(
                qnum,
                q_text,
                marks_label,
                options=options,
                correct_answer=answer_str,
                q_type=q_type,
            )
        w.gap(12)

    out_path = answer_key_pdf_path(paper.id)
    doc.save(str(out_path))
    doc.close()
    return answer_key_pdf_public_url(paper.id)


def ensure_answer_key_pdf(paper: QuestionPaper) -> str | None:
    return generate_answer_key_pdf(paper)
