# VidyaSetu LMS — Developer Guide

VidyaSetu is a school LMS for **teachers** and **students**: create NCERT-based assessments, assign to a class, track submissions, and review scores. This document is the **runbook** (setup, testing, APIs, routes). Platform roadmap: [AITUTOR_LMS_PLAN.md](./AITUTOR_LMS_PLAN.md).

---

## What’s in the product

```mermaid
flowchart TB
  subgraph Portal["Web app (Next.js)"]
    T[Teacher portal]
    S[Student portal]
  end

  subgraph API["Backend (FastAPI)"]
    Auth[Auth / JWT]
    Quiz[Quizzes & assignments]
    Papers[Question papers]
    AI[NCERT AI generate + grade]
  end

  subgraph Data["PostgreSQL"]
    DB[(users · quizzes · papers · attempts)]
  end

  T --> API
  S --> API
  API --> DB
  AI --> API
```

| Module | Teacher | Student | Purpose |
|--------|---------|---------|---------|
| **My Quizzes** | Quiz Builder → Assign | My Quizzes → Attempt | Short timed MCQ quizzes in the app |
| **Question Papers** | Paper Builder → Distribute | Question Papers | Formal multi-section exams (PDF + optional online modes) |

Both modules share: NCERT chapter picker, class scoping (`class-8a` demo), dashboards, sidebar badges, JWT auth.

---

## Quick start

```bash
pip install -r requirements.txt
python3 scripts/start_web.py
# Open http://localhost:{FRONTEND_PORT}/login
```

Optional NCERT knowledge base: `python3 scripts/setup_ncert_all.py`

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Student | priya@student.vidyasetu.in | student123 |
| Teacher | ravi@teacher.vidyasetu.in | teacher123 |
| Admin | admin@vidyasetu.in | admin123 |

Demo school class: **`class-8a`**

---

## How to verify it works

### Manual smoke (release checklist)

```mermaid
flowchart LR
  subgraph Teacher
    T1[Login Ravi] --> T2[Quiz OR Paper flow]
    T2 --> T3[Publish / Distribute]
    T3 --> T4[Review submissions]
  end
  subgraph Student
    S1[Login Priya] --> S2[Dashboard badge]
    S2 --> S3[Complete task]
    S3 --> S4[Result + badge clears]
  end
  T3 --> S2
  S3 --> T4
```

| Flow | Steps |
|------|--------|
| **Quiz** | Quiz Builder → NCERT generate → Publish → Assign `class-8a` → Priya: My Quizzes → Submit → Teacher: Submissions |
| **Question paper** | Paper Builder → Publish → Distribute (pick mode) → Priya: dashboard + Question Papers → complete mode → Teacher: distribution → View answers / grade |

### API token (curl)

```bash
curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"priya@student.vidyasetu.in","password":"student123","role":"student"}'
```

Use header: `Authorization: Bearer <access_token>`

---

## Frontend map

```mermaid
flowchart LR
  subgraph Student["/student"]
    SD[dashboard]
    SQ[quizzes]
    SP[papers]
    SD --> SQ
    SD --> SP
  end
  subgraph Teacher["/teacher"]
    TD[dashboard]
    TQ[quiz-builder · quizzes · assignments]
    TP[paper-builder · papers]
    TD --> TQ
    TD --> TP
  end
```

### Student routes

| URL | What it does |
|-----|----------------|
| `/student/dashboard` | Pending quiz/paper counts, recent assignments & papers, heatmap |
| `/student/quizzes` | Quiz list |
| `/student/quizzes/{id}/attempt` | Take quiz (save & exit supported) |
| `/student/quizzes/{id}/result` | Score + feedback |
| `/student/papers` | Papers: Pending · Submitted · Overdue · All |
| `/student/papers/{distributionId}` | Paper detail + actions |
| `/student/papers/{distributionId}/practice` | Section A MCQ practice |
| `/student/papers/{distributionId}/exam` | Full online test |
| `/student/papers/{distributionId}/submit` | Upload written answer sheets |
| `/student/papers/{distributionId}/result` | Result (practice / exam / written) |

### Teacher routes

| URL | What it does |
|-----|----------------|
| `/teacher/dashboard` | Class metrics, papers to review, distributed papers shortcuts |
| `/teacher/quiz-builder` | Create/edit quiz (`?quiz_id=`) |
| `/teacher/quizzes` | Quiz library |
| `/teacher/assignments` | Assign quiz + view submissions |
| `/teacher/paper-builder` | Create/edit paper (`?paper_id=`) |
| `/teacher/papers` | My Papers (`?tab=all\|draft\|published\|distributed`) |
| `/teacher/papers/distributions/{id}` | Per-student tracking + View answers |
| `/teacher/papers/practice-attempts/{id}/review` | Review MCQ practice |
| `/teacher/papers/exam-attempts/{id}/grade` | Grade online exam |
| `/teacher/papers/written-submissions/{id}/grade` | Grade written upload |

**Key frontend code:** `web/services/lmsApi.ts` · `web/store/authStore.ts` · `web/store/portalStore.ts` (`nav_badges`) · `web/components/lms/ProtectedRoute.tsx`

---

## API reference

Base URL: `http://localhost:8001` (or your `API_BASE`). All routes below require `Authorization: Bearer …` except auth login/register.

### Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Email + password + role → JWT |
| POST | `/api/auth/register` | New account |
| GET | `/api/auth/me` | Session restore |
| POST | `/api/auth/google` | Google OAuth |
| POST | `/api/auth/logout` | Client clears token |

### Student — dashboard & quizzes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/dashboard` | `quizzes_pending`, `papers_pending`, `recent_papers`, assignments, heatmap, `nav_badges` |
| GET | `/api/student/assignments` | `?status=pending\|submitted\|overdue\|all` |
| GET | `/api/student/assignments/{id}` | Detail (no correct answers) |
| GET | `/api/student/assignments/{id}/result` | Score after submit |
| POST | `/api/student/quizzes/{id}/start` | Start / resume attempt |
| PATCH | `/api/student/quizzes/{id}/draft` | Save & exit |
| POST | `/api/student/quizzes/{id}/submit` | Submit → auto-score |

### Student — question papers

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/papers` | `?status=pending\|submitted\|overdue\|all` |
| GET | `/api/student/papers/{distribution_id}` | Detail |
| GET | `/api/student/papers/{distribution_id}/download` | PDF download URL |
| POST/GET | `.../practice/start` · `.../practice/resume` · `.../practice/submit` | MCQ practice |
| POST/GET | `.../exam/start` · `.../exam/resume` · `.../exam/submit` · `.../exam/result` | Online test |
| GET/POST | `.../written` · `.../written/upload` · `.../written/submit` · `.../written/result` | Written upload |

### Teacher — dashboard & quizzes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/teacher/dashboard` | Metrics, `papers_pending_review`, `nav_badges` |
| GET/POST/PUT/DELETE | `/api/teacher/quizzes` · `.../{id}` | Quiz CRUD |
| POST | `/api/teacher/quizzes/{id}/publish` | Publish |
| POST | `/api/teacher/quizzes/generate-from-ncert` | AI MCQs |
| GET/POST/DELETE | `/api/teacher/assignments` · `.../{id}` | Assign & remove |

### Teacher — question papers

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PUT/DELETE | `/api/teacher/papers` · `.../{id}` | Paper CRUD (delete cascades) |
| POST | `/api/teacher/papers/{id}/publish` | Publish (≥1 question) |
| GET | `/api/teacher/papers/blueprint-presets` | Exam-type presets |
| POST | `/api/teacher/papers/generate-from-ncert` | AI fill blueprint slots |
| POST | `/api/teacher/papers/{id}/pdf/regenerate` | Regenerate PDF |
| GET/POST | `/api/teacher/papers/{id}/answer-key` · `.../answer-key/pdf` | Answer key |
| GET/POST/DELETE | `/api/teacher/paper-distributions` · `.../{id}` | Distribute & track |
| GET/PATCH | `/api/teacher/paper-exam-attempts/{id}` | Online exam grade |
| GET | `/api/teacher/paper-practice-attempts/{id}` | Practice review |
| GET/PATCH | `/api/teacher/paper-written-submissions/{id}` | Written grade |

### Analytics & AI

| Path | Purpose |
|------|---------|
| `GET /api/analytics/*` | Weak topics, heatmap, at-risk |
| `POST /api/ai/*` | Grading helpers (rate-limited) |

---

## Database

Set `DATABASE_URL` in `.env`, e.g.:

`postgresql+psycopg2://AiTutor:aitutor123@localhost:5432/AiTutor`

```mermaid
erDiagram
  users ||--o{ question_papers : creates
  question_papers ||--o{ paper_distributions : has
  paper_distributions ||--o{ paper_practice_attempts : tracks
  paper_distributions ||--o{ paper_written_submissions : tracks
  paper_distributions ||--o{ paper_student_events : logs
  users ||--o{ quizzes : creates
  quizzes ||--o{ assignments : has
  assignments ||--o{ quiz_attempts : tracks
```

**Tables to know:** `users`, `quizzes`, `assignments`, `quiz_attempts`, `topic_proficiency`, `question_papers`, `paper_distributions`, `paper_student_events`, `paper_practice_attempts`, `paper_written_submissions`.

**Paper backend services:** `src/lms/services/paper_flow.py`, `paper_dashboard.py`, `paper_tracking.py`, `paper_pdf_export.py`, `ncert_paper_generate.py`

---

## Related docs

| Document | Use when |
|----------|----------|
| [AITUTOR_LMS_PLAN.md](./AITUTOR_LMS_PLAN.md) | Future platform work (onboarding, planner, etc.) |
