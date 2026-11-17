# AiTutor LMS — End-to-End Build Plan

**Purpose:** Single tracking document for product flow, priorities, and implementation checkboxes.  
**Last updated:** May 2026  
**Priority:** Teacher dashboard + Student dashboard first. Head / Company onboarding later.

---

## How to use this doc

- Check boxes `[ ]` → `[x]` as work completes.
- Build **top to bottom** within each phase (do not skip Phase 0 before quiz flow).
- For meeting / sales, see [§ End-to-end chain](#end-to-end-chain-theory).
- For mocks: login = Student + Staff tabs; Principal portal = Head after Staff login.

---

## Product summary (3 doors)

| Door | Who | URL (target) | Visible to schools? |
|------|-----|--------------|---------------------|
| **Company** | AiTutor team | `/company/login` | No (hidden) |
| **Staff** | School Head + Teachers | `/login` → Staff | Yes |
| **Student** | Students | `/login` → Student | Yes |

**Rule:** Student belongs to a **class**. Content is filtered by **class** (all subject teachers for that class). Teachers see only **their class + subject**.

**Two school patterns (same app):**

| Pattern | Example | Head registers |
|---------|---------|----------------|
| Small class | Class 2-A | 1 teacher → all subjects |
| Large class | Class 8-A | 1 teacher per subject |

---

## End-to-end chain (theory)

```
① COMPANY     → Create school + Head login → give credentials to school
       ↓
② HEAD        → Staff login → create classes (+ class codes)
       ↓
③ HEAD        → Register teachers per class/subject → give each teacher credentials
       ↓
④ HEAD        → Register students per class (manual / class code / CSV)
       ↓
⑤ TEACHER     → Staff login → create quiz → publish to class
       ↓
⑥ STUDENT     → Student login (own email/password)
       ↓
⑦ STUDENT     → Attempt quiz → Submit
       ↓
⑧ MONITOR     → Teacher tracks (own subject) + Head tracks (whole school)
```

### Student registration (class-wise)

| Method | Who does it | Class set when |
|--------|-------------|----------------|
| Head adds manually | Head | On create |
| Class code join | Student/parent | Code = class (e.g. `JOIN-8A-2026`) |
| CSV bulk | Head | Column `class` |

Daily student login = **email + password only** (class already on account).

---

## Current codebase status

### Done

- [x] Auth: login, JWT, roles (`student`, `teacher`, `admin`)
- [x] `GET /api/student/dashboard`
- [x] `GET /api/teacher/dashboard`
- [x] `GET /api/analytics/*` (backend only)
- [x] `POST /api/ai/grade-answer`
- [x] PostgreSQL + seed demo users/assignments
- [x] Student + Teacher dashboard UI (read-mostly)
- [x] AI Tutor routes (chat, knowledge, etc.) — separate from LMS loop

### Phase 0 done (May 2026)

- [x] `quizzes` table + quiz CRUD APIs
- [x] Assignment create/list APIs (teacher + student)
- [x] Quiz attempt start/submit APIs
- [x] `web/services/lmsApi.ts` Phase 0 methods
- [x] Testing + API reference: [VIDYASETU.md](./VIDYASETU.md)

### Not done (stubs / missing)
- [x] Quiz flow UI: `/student/quizzes`, attempt/result, `/teacher/quiz-builder`, `/teacher/quizzes`, `/teacher/assignments`
- [ ] Staff 2-tab login (Student + Staff)
- [ ] Company `/company` onboard
- [ ] Head portal (classes, teachers, students UI)
- [ ] `schools`, `class_sections`, `class_teacher_subjects` tables

### Demo logins (until Head flow exists)

| Role | Email | Password |
|------|-------|----------|
| Student | `priya@student.vidyasetu.in` | `student123` |
| Teacher | `ravi@teacher.vidyasetu.in` | `teacher123` |
| Admin | `admin@vidyasetu.in` | `admin123` |

---

## Build priority overview

```
P0  Foundation (DB + assignment/quiz APIs)     ← blocker
P1  Student dashboard + quiz attempt           ← PRIORITY 1
P2  Teacher dashboard + quiz assign            ← PRIORITY 2
P3  Monitor (scores, analytics wire)           ← PRIORITY 3
P4  Polish (AI grading, reattempt, UX)
P5  Head + Company + class code (later)
```

**Recommended timeline**

| Week | Focus |
|------|--------|
| 1 | P0 + P1 (student quiz E2E) |
| 2 | P2 (teacher create + publish) |
| 3 | P3 (tracking both sides) |
| 4 | P4 + demo hardening |
| 5+ | P5 (onboarding product) |

---

## Phase 0 — Foundation (blocker)

**Goal:** Data model + APIs so student/teacher UIs have real data.

### Database / models

- [x] Add `quizzes` table (`id`, `teacher_id`, `title`, `subject`, `questions` JSON, `status`, `duration_mins`, `total_marks`)
- [x] Extend `assignments`: `teacher_id`, `subject` (or keep `class_id` string until P5 migration)
- [ ] Optional: `class_sections`, `schools` — defer to P5 if using seed `class_id` for now
- [x] `init_db` + `_migrate_p0_columns` + seed quizzes linked to assignments

### Backend APIs

- [x] `GET /api/student/assignments` — filter by `user.class_id`
- [x] `GET /api/student/assignments/{id}` — detail + attempt status
- [x] `POST /api/student/quizzes/{assignment_id}/start`
- [x] `POST /api/student/quizzes/{assignment_id}/submit`
- [x] `GET /api/teacher/assignments?class_id=`
- [x] `POST /api/teacher/assignments`
- [x] `GET /api/teacher/assignments/{id}/attempts`
- [x] `POST /api/teacher/quizzes` + `GET` + `PUT` + publish
- [x] Pydantic schemas in `src/lms/schemas.py`
- [x] Cache invalidation on assign/submit (`student_dashboard:{id}`)

### Frontend shared

- [x] `web/services/lmsApi.ts` — all new methods + types
- [ ] `web/types/lms.ts` — `Quiz`, `Attempt`, etc.

---

## Phase 1 — Student dashboard (PRIORITY 1)

**Milestone:** Student logs in → sees quiz → attempts → submits → sees score.

### Pages

- [x] `/student/dashboard` — assignments from real DB (via dashboard API)
- [x] `/student/quizzes` — real list (`fetchStudentAssignments`)
- [x] `/student/quizzes/[assignmentId]/attempt` — questions + timer + submit
- [x] `/student/quizzes/[assignmentId]/result` — score + feedback (sessionStorage after submit)

### UX

- [x] Subject badge on cards (Physics, Chemistry, …)
- [x] Due labels, attempts used/max, Completed / Attempt Now
- [x] Empty: no assignments
- [x] Loading, error, retry on quiz pages

### Backend (if not in P0)

- [ ] Start attempt → `quiz_attempts` row `in_progress`
- [ ] Submit → score, `completed`, `completed_at`
- [ ] Enforce `can_attempt` (max attempts, due date)

---

## Phase 2 — Teacher dashboard (PRIORITY 2)

**Milestone:** Teacher creates quiz → assigns to class → students see it.

### Pages

- [x] `/teacher/dashboard` — metrics, assignment badge, weak students
- [x] `/teacher/quiz-builder` — NCERT generate, draft/publish, local draft restore
- [x] `/teacher/quizzes` — list, edit, delete
- [x] `/teacher/assignments` — list, create modal, submissions per assignment

### UX

- [x] Class selector (MVP: `class-8a` seed)
- [x] Publish + assign links `quiz_id` + `class_id` + `due_at`
- [ ] Multi-class / multi-subject teacher mapping (P5)

### Backend (if not in P0)

- [x] Teacher-scoped assignment count + list
- [x] `GET /api/teacher/assignments/{id}/attempts`

---

## Phase 3 — Monitor & analytics (PRIORITY 3)

**Milestone:** Chain steps ⑧–⑩ — teacher + head-style overview from data.

### Teacher

- [x] Assignment submissions: per-student table (name, status, score)
- [ ] Dashboard: pending evaluations count fully from real queue (partially seeded)

### Student

- [ ] Attempt history on assignment/quiz
- [ ] `/student/analytics` — wire `GET /api/analytics/heatmap` (replace stub)

### Data

- [ ] On submit: upsert `topic_proficiency` by topic/subject
- [ ] Teacher dashboard weak topics aligned with real proficiency

### Head (read-only on teacher dashboard for demo)

- [ ] Until P5: use existing teacher dashboard + admin seed for school-wide view
- [ ] Or: principal uses `admin` login temporarily

---

## Phase 4 — Polish

- [ ] Short answers → `POST /api/ai/grade-answer` during/submit
- [ ] Low confidence → `teacher_review_queue` row
- [ ] `/teacher/review` — real queue UI (replace stub)
- [ ] Reattempt policies wired (`reattempt_policies` table exists)
- [ ] Mobile-friendly attempt UI
- [ ] TanStack Query or consistent cache refresh after mutations

---

## Phase 5 — Onboarding & product (later)

### Login / roles

- [ ] Public login: **2 tabs** — Student | Staff (remove public Admin tab)
- [ ] Staff login → auto-detect **Head** vs **Teacher** → different sidebar
- [ ] `/company/login` — AiTutor team only; create school + Head account
- [ ] Roles: `platform_admin`, `head`, `teacher` (split from single `admin`)

### Data model (production school)

- [ ] `schools` table
- [ ] `class_sections` + `join_code`
- [ ] `class_teacher_subjects` (teacher + class + subject)
- [ ] `users.school_id`, students linked to `class_section_id`
- [ ] All content queries: student by class; teacher by mapping

### Head (Principal portal — mock exists)

- [ ] `/staff/dashboard` — Head view (Teachers, Students, Classes, School analytics)
- [ ] Head: CRUD classes, teachers, students
- [ ] Head: copy class code, bulk CSV students
- [ ] Student: join with class code flow

### Stubs to implement later

- [ ] `/teacher/papers`, `/teacher/calendar`, `/teacher/reports`
- [ ] `/student/papers`, `/student/calendar`, `/student/planner`
- [ ] `exam_events` table + calendar sync

---

## API checklist (target state)

| Method | Path | Role | Phase |
|--------|------|------|-------|
| GET | `/api/student/dashboard` | student | done |
| GET | `/api/student/assignments` | student | P0 |
| GET | `/api/student/assignments/{id}` | student | P0 |
| POST | `/api/student/quizzes/{id}/start` | student | P0 |
| POST | `/api/student/quizzes/{id}/submit` | student | P0 |
| GET | `/api/teacher/dashboard` | teacher | done |
| GET | `/api/teacher/assignments` | teacher | P0 |
| POST | `/api/teacher/assignments` | teacher | P0 |
| GET | `/api/teacher/assignments/{id}/attempts` | teacher | P0 |
| POST/GET/PUT | `/api/teacher/quizzes` | teacher | P0 |
| GET | `/api/analytics/heatmap` | student | P3 |
| POST | `/api/ai/grade-answer` | any | P4 |

---

## File map (where to build)

| Area | Paths |
|------|--------|
| Models | `src/lms/models.py` |
| Schemas | `src/lms/schemas.py` |
| Student API | `src/lms/routers/student.py` |
| Teacher API | `src/lms/routers/teacher.py` |
| Seed | `src/lms/seed.py` |
| API client | `web/services/lmsApi.ts` |
| Student UI | `web/app/student/dashboard`, `quizzes`, `analytics` |
| Teacher UI | `web/app/teacher/dashboard`, `assignments`, `quiz-builder`, `review` |
| Login | `web/app/login/page.tsx` |
| Company (P5) | `web/app/company/**` |
| Staff/Head (P5) | `web/app/staff/**` or role-gated `/teacher` |

---

## Testing checklist (manual E2E)

See `docs/VIDYASETU.md` for manual smoke steps.

After P1 + P2 + NCERT flow:

1. [x] Teacher login → create quiz → publish assignment for `class-8a`
2. [x] Student `priya@...` login → quiz visible on dashboard + `/student/quizzes`
3. [x] Student attempt → submit → score shown
4. [x] Teacher assignment detail → Priya marked submitted with score (`asgn-754b14ca767a`)
5. [ ] Second student in same class sees same quiz; different class does not (manual spot-check)

---

## Meeting script (30 sec)

> AiTutor gives schools **Student** and **Staff** logins. We onboard the school head internally. The head sets up classes and teachers; teachers publish quizzes; students attempt on their dashboard; teachers and the head monitor progress. We are building **student attempt first**, then **teacher assign**, then onboarding.

---

## Related docs

- `docs/VIDYASETU.md` — quick start, testing, API + UI routes (replaces old PHASE0/PHASE1 docs)
- `.env.example` — `DATABASE_URL` for PostgreSQL

---

## Changelog

| Date | Change |
|------|--------|
| May 2026 | Initial plan: P0–P5, E2E chain, Teacher/Student priority |
