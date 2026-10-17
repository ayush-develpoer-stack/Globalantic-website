# Marketing & Sales intern examinations

Built 2026-10-15. These are online assessments for college students recruited into Globalantic's marketing and sales internships. Staff work in the **admin portal** (*Internship exams*) and candidates in the **intern/student portal** (*Internship exams*).

## What it does

| Area | Details |
|---|---|
| Question bank | Marketing or Sales track, free-text topic (suggested: communication, lead generation, sales fundamentals, customer handling, digital marketing, practical scenarios). Types: single choice, multiple select, true/false, written (descriptive). Marks per question, evaluator guidance, an optional explanation, and archive/restore. |
| Exams | Kinds: online test, practical assessment (written tasks), interview stage (results recorded by staff). Settings: time limit, pass %, negative marking %, attempts allowed, random subset per attempt, shuffling of questions and options, opening and closing times, eligibility note, result visibility (immediate or on release), reveal answers. Lifecycle: draft → published → archived. |
| Assignment | To an individual intern, a batch (active enrolments), a college (`StudentProfile.institution`, case-insensitive), or an internship role/programme (a course). Assigned interns get an in-app notification when the exam is published, or when a group is added later. |
| Taking an exam | Instructions, eligibility and rules first. During the exam: a countdown, one question per screen, a question palette, mark-for-review, autosave, a local copy of unsaved answers, an offline indicator, and confirmation before submitting. Answers are submitted automatically at zero. |
| Results | History of attempts. Score, %, pass/fail, overall feedback and per-question marks and comments, shown only when the exam's visibility rule allows. Correct answers and explanations are shown only if the exam reveals them. |
| Staff | Attempts list (filters, search, pagination), evaluation of written answers with optional override of auto-marks, retake grants with a reason, interview results, release results, report (by topic and by question), CSV export (audited), per-student performance page. |

## Integrity and security, enforced by the API (`backend/src/services/exam.service.ts`)

**Access**
- Students only see published exams assigned to them. Anything else returns 404.
- The student id always comes from the session.
- Staff routes need `exams.manage`, `exams.evaluate` or `exams.results.read`. ADMIN and HR have all three; FINANCE, EDITOR, TRAINER and STUDENT have none.

**Answer keys**
- `correctOptionIds`, `guidance` and `explanation` are never part of a student response before the result is visible.
- Option ids are random, so their position reveals nothing.
- A test checks the attempt payload for leaks.

**Timing**
- Each attempt stores its server deadline: `min(start + duration, exam close)`.
- Saves after deadline + 15 s grace are refused.
- Late attempts are auto-submitted lazily on the next read by anyone. No cron is needed.

**Limits and duplicates**
- The attempt limit (plus retake grants) and the opening window are checked on start.
- One active attempt per student. A unique `(exam, student, attemptNo)` constraint turns concurrent starts into a resume.
- Save, submit and evaluate lock the attempt row (`SELECT … FOR UPDATE`), so a save can't land after a submission and a second submission returns 409.

**Answer validation**
- A question must belong to the attempt.
- Options must exist.
- Single-choice and true/false questions accept at most one option.
- Written answers are limited to 10,000 characters.

**Scoring**
- Server-side and all-or-nothing per objective question.
- With negative marking, a wrong answer loses `negativeMarkPercent` % of the question's marks. A blank answer loses nothing, and the total never goes below 0.
- Evaluators award marks between 0 and the question's marks, at most 2 decimals.

**Edit locks**
- Questions used by a non-draft exam, or already answered, can't be edited. Archive them and create new ones.
- Once an exam is published, scoring settings (track, kind, duration, pass %, negative marking, question count, shuffling, interview marks) and its question set are fixed.

**Audit trail**
- Recorded: question create/update/archive; exam create/update, publish, archive and assignment changes; attempt started, submitted or auto-submitted, evaluated; retake granted; interview recorded; results released; result export.

**Rate limits**
- Autosave has its own per-user limiter (60/min) and is exempt from the per-IP API limit, so a class sharing one college IP doesn't throttle itself.

**What it does not do.** A browser-based test can't stop someone from using another device or getting help. The portal records how often the exam tab lost focus (shown to staff as "tab switches", informational only) and otherwise relies on timing, randomisation, single attempts and human review. It doesn't claim to prevent cheating.

## Learning-material files (shipped in the same migration)

Trainers can upload a file (PDF/PNG/JPEG/WEBP, 5 MB, type checked by magic bytes) as a learning material instead of a link. Downloads are allowed only for students enrolled in that batch, the batch's trainers, and staff with `training.learning.read`. Everyone else gets 404.

## Database: migration `20261018090000_intern_exams_and_material_files`

The migration is additive:
- 6 enums
- 7 tables: `exam_questions`, `exams`, `exam_question_links`, `exam_assignments`, `exam_attempts`, `exam_answers`, `exam_retake_grants`
- the `FilePurpose` value `LEARNING_MATERIAL`
- the nullable column `learning_materials.fileId`
- `learning_materials.url` relaxed to nullable

No existing data is changed or removed.

**Status:** applied to Supabase on 2026-10-15, with the owner's approval, after a drift check, a full backup and a rehearsal. All 60 tables kept identical row counts. Also applied to the local dev DB and the test databases.

## API

Student routes (`/api/exams/student`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/exams`, `/exams/:id` | Assigned exams with state, attempts and eligibility |
| POST | `/exams/:id/start` | Start or resume (201/200) |
| GET | `/attempts`, `/attempts/:id` | History; attempt with questions and saved answers (no key) |
| PUT | `/attempts/:id/answers` | Autosave `{answers:[{questionId, selectedOptionIds?, text?}], focusLost?}` |
| POST | `/attempts/:id/submit` | Final submit; 409 if already submitted |
| GET | `/attempts/:id/result` | Result when visible |

Staff routes (`/api/exams/admin`):

| Method | Path | Purpose |
|---|---|---|
| — | `/questions…` | List, get, create, update; `PATCH /questions/:id/archive` |
| GET | `/topics` | Topics in the bank |
| — | `/exams…` | List, get, create, update |
| PUT | `/exams/:id/questions` | Set the exam's questions |
| POST | `/exams/:id/publish`, `/exams/:id/archive`, `/exams/:id/release-results` | Lifecycle |
| GET | `/targets` | Assignment choices |
| POST, DELETE | `/exams/:id/assignments[/:assignmentId]` | Assign / unassign |
| GET | `/exams/:id/attempts`, `/attempts/:id` | Attempts and staff view of one attempt |
| POST | `/attempts/:id/evaluate` | Mark written answers / override |
| POST | `/exams/:id/retakes` | Grant a retake |
| POST | `/exams/:id/interview-results` | Record an interview result |
| GET | `/exams/:id/report`, `/exams/:id/export` | Report; CSV rows (audited) |
| GET | `/students/:studentId/performance` | One student's exam history |

## Verification (2026-10-15)

- **API tests:** `npm --workspace backend test -- exams` → 11/11. Covered:
  - access rules;
  - key secrecy;
  - lifecycle;
  - immediate results and revealed answers;
  - deadline and auto-submit;
  - schedule window;
  - attempt limits and retakes;
  - concurrent starts;
  - edit locks;
  - college and batch assignment with random subsets;
  - interview stage, report and export;
  - material files;
  - negative marking.
- **Browser (headless Edge, local DB):** the full flow ran through the real admin and intern UIs with 0 console errors:
  - create questions → create exam → attach questions → assign → publish;
  - intern starts → autosave → refresh restores answers → submit → duplicate submit 409;
  - staff evaluate → release → intern sees score 1.5/3 with feedback;
  - another student gets 404.
  - At 360 px the timer is visible and there is no horizontal overflow.
