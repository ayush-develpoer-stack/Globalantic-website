'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CloudOff, Flag, Loader2, Timer } from 'lucide-react';
import { ApiError, api, errorMessage } from '@globalantic/api-client';
import type { ExamAnswerInput, ExamAnswerValue, ExamAttemptQuestion, StudentExamAttempt } from '@globalantic/types';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, LoadingState, Textarea } from '@globalantic/ui';
import s from '@/components/page.module.css';
import e from '@/components/exam.module.css';
import { TRACK_LABEL, formatRemaining } from '@/components/exam-ui';
import { usePageTitle } from '@/components/usePageTitle';

/**
 * Taking an exam. The server owns the deadline, the scoring and the single submission;
 * this page only keeps the student's work safe:
 * - answers autosave (debounced) and are mirrored to localStorage until the server confirms them,
 *   so a refresh or a dropped connection loses nothing;
 * - the countdown uses the server clock offset, and the attempt is submitted when it reaches zero;
 * - leaving the tab is reported (counted only — it is not proof of anything).
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';
const MAX_TEXT = 10_000;
const backupKey = (id: string) => `globalantic.exam.${id}`;

function readBackup(id: string): Record<string, ExamAnswerValue> {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Record<string, ExamAnswerValue>) : {};
  } catch {
    return {};
  }
}
function writeBackup(id: string, unsaved: Record<string, ExamAnswerValue>) {
  try {
    if (Object.keys(unsaved).length) window.localStorage.setItem(backupKey(id), JSON.stringify(unsaved));
    else window.localStorage.removeItem(backupKey(id));
  } catch {
    // storage blocked: autosave still works, only the offline copy is unavailable
  }
}

const isAnswered = (q: ExamAttemptQuestion, a?: ExamAnswerValue) => (q.type === 'DESCRIPTIVE' ? Boolean(a?.text?.trim()) : Boolean(a?.selectedOptionIds?.length));
const toInput = (q: ExamAttemptQuestion, a?: ExamAnswerValue): ExamAnswerInput =>
  q.type === 'DESCRIPTIVE' ? { questionId: q.id, text: a?.text ?? null } : { questionId: q.id, selectedOptionIds: a?.selectedOptionIds ?? [] };

export default function TakeExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  usePageTitle('Exam in progress');

  const [attempt, setAttempt] = useState<StudentExamAttempt | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; status: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, ExamAnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const questionsRef = useRef<Map<string, ExamAttemptQuestion>>(new Map());
  const dirty = useRef<Set<string>>(new Set());
  const versions = useRef<Record<string, number>>({});
  const focusLost = useRef(0);
  const inFlight = useRef(false);
  const closed = useRef(false);
  const submittingRef = useRef(false);
  const offset = useRef(0);
  const deadline = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const announced = useRef<Set<number>>(new Set());

  const persist = useCallback(() => {
    const unsaved: Record<string, ExamAnswerValue> = {};
    dirty.current.forEach((qid) => {
      if (answersRef.current[qid]) unsaved[qid] = answersRef.current[qid];
    });
    writeBackup(id, unsaved);
  }, [id]);

  const goToResult = useCallback(() => {
    closed.current = true;
    writeBackup(id, {});
    router.replace(`/exams/attempts/${id}`);
  }, [id, router]);

  // ---- Load (server answers + any unsaved local copy) -------------------------
  useEffect(() => {
    let active = true;
    api()
      .exams.attempt(id)
      .then((a) => {
        if (!active) return;
        if (a.status !== 'IN_PROGRESS') {
          goToResult();
          return;
        }
        offset.current = Date.parse(a.serverNow) - Date.now();
        deadline.current = Date.parse(a.deadlineAt);
        questionsRef.current = new Map(a.questions.map((q) => [q.id, q]));
        const merged: Record<string, ExamAnswerValue> = {};
        for (const [qid, v] of Object.entries(a.answers)) merged[qid] = { selectedOptionIds: v.selectedOptionIds, text: v.text };
        const local = readBackup(id);
        for (const [qid, v] of Object.entries(local)) {
          if (!questionsRef.current.has(qid)) continue;
          merged[qid] = v;
          dirty.current.add(qid);
          versions.current[qid] = (versions.current[qid] ?? 0) + 1;
        }
        setAnswers(merged);
        setAttempt(a);
        setRemaining(deadline.current - (Date.now() + offset.current));
        if (dirty.current.size) setSaveState('idle');
      })
      .catch((err: unknown) => {
        if (active) setLoadError({ message: errorMessage(err), status: err instanceof ApiError ? err.status : 0 });
      });
    return () => {
      active = false;
    };
  }, [id, goToResult]);

  // ---- Saving -------------------------------------------------------------------
  const flush = useCallback(async () => {
    if (inFlight.current || closed.current || submittingRef.current) return;
    const ids = [...dirty.current];
    const lost = focusLost.current;
    if (!ids.length && !lost) return;
    const sent: Record<string, number> = {};
    const payload: ExamAnswerInput[] = [];
    for (const qid of ids) {
      const q = questionsRef.current.get(qid);
      if (!q) continue;
      sent[qid] = versions.current[qid] ?? 0;
      payload.push(toInput(q, answersRef.current[qid]));
    }
    inFlight.current = true;
    setSaveState('saving');
    try {
      const r = await api().exams.save(id, payload, lost);
      // Only clear what has not changed again while the request was in flight.
      for (const qid of Object.keys(sent)) if ((versions.current[qid] ?? 0) === sent[qid]) dirty.current.delete(qid);
      focusLost.current = Math.max(0, focusLost.current - lost);
      offset.current = Date.parse(r.serverNow) - Date.now();
      retryDelay.current = 2000;
      persist();
      setSaveError(null);
      setSaveState(dirty.current.size ? 'idle' : 'saved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        goToResult();
        return;
      }
      persist();
      if (err instanceof ApiError && err.status === 422) {
        setSaveState('error');
        setSaveError(errorMessage(err));
      } else {
        setSaveState('offline');
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flush(), retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
      }
    } finally {
      inFlight.current = false;
    }
  }, [id, persist, goToResult]);

  const change = (qid: string, value: ExamAnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: value };
      answersRef.current = next;
      return next;
    });
    dirty.current.add(qid);
    versions.current[qid] = (versions.current[qid] ?? 0) + 1;
    persist();
    setSaveState((st) => (st === 'offline' ? st : 'idle'));
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void flush(), 1200);
  };

  // Periodic safety net, reconnect, and tab-focus reporting.
  useEffect(() => {
    if (!attempt) return;
    const every = setInterval(() => {
      if (dirty.current.size || focusLost.current) void flush();
    }, 10_000);
    const online = () => void flush();
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        focusLost.current += 1;
        persist();
      } else void flush();
    };
    const beforeUnload = (ev: BeforeUnloadEvent) => {
      if (dirty.current.size && !closed.current) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      clearInterval(every);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('beforeunload', beforeUnload);
      if (debounce.current) clearTimeout(debounce.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [attempt, flush, persist]);

  // ---- Submitting -----------------------------------------------------------------
  const submit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current || closed.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      const unsaved: ExamAnswerInput[] = [];
      dirty.current.forEach((qid) => {
        const q = questionsRef.current.get(qid);
        if (q) unsaved.push(toInput(q, answersRef.current[qid]));
      });
      for (let tries = 0; ; tries += 1) {
        try {
          await api().exams.submit(id, unsaved);
          goToResult();
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            goToResult();
            return;
          }
          // Time-up submits keep retrying briefly; the server finalises late attempts on its own anyway.
          if (auto && tries < 6) {
            setSubmitError('Time is up. Submitting your answers… (retrying)');
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          if (auto) {
            goToResult();
            return;
          }
          setSubmitError(errorMessage(err));
          submittingRef.current = false;
          setSubmitting(false);
          throw err;
        }
      }
    },
    [id, goToResult],
  );

  // ---- Countdown --------------------------------------------------------------------
  useEffect(() => {
    if (!attempt) return;
    const tick = () => {
      const left = deadline.current - (Date.now() + offset.current);
      setRemaining(left);
      for (const mark of [10, 5, 1]) {
        if (left <= mark * 60_000 && left > (mark - 1) * 60_000 && !announced.current.has(mark)) {
          announced.current.add(mark);
          setAnnounce(`${mark} minute${mark > 1 ? 's' : ''} remaining`);
        }
      }
      if (left <= 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [attempt, submit]);

  const questions = useMemo(() => attempt?.questions ?? [], [attempt]);
  const answeredCount = useMemo(() => questions.filter((q) => isAnswered(q, answers[q.id])).length, [questions, answers]);

  if (loadError) {
    return loadError.status === 404 ? (
      <ErrorState title="Attempt not found" message="This attempt does not exist or is not yours." />
    ) : (
      <ErrorState title="Could not load the exam" message={`${loadError.message} Your timer keeps running on the server — reload this page to continue.`} onRetry={() => window.location.reload()} />
    );
  }
  if (!attempt || remaining === null) return <LoadingState label="Loading your exam…" />;

  const q = questions[current];
  const a = answers[q.id];
  const low = remaining <= 5 * 60_000;
  const flagged = flags.has(q.id);

  return (
    <div className={s.stack}>
      <div className={e.bar} role="region" aria-label="Exam status">
        <span className={e.barTitle}>
          {attempt.exam.title} <Badge tone="primary">{TRACK_LABEL[attempt.exam.track]}</Badge>
        </span>
        <span className={s.row}>
          <SaveIndicator state={saveState} />
          <span className={`${e.timer} ${low ? e.timerLow : ''}`} aria-label={`Time remaining ${formatRemaining(remaining)}`}>
            <Timer size={18} aria-hidden />
            {formatRemaining(remaining)}
          </span>
        </span>
        <span className="sr-only" aria-live="assertive">
          {announce}
        </span>
      </div>

      {saveError && <Alert tone="danger">{saveError}</Alert>}
      {submitError && <Alert tone="warning">{submitError}</Alert>}

      <div className={e.layout}>
        <Card>
          <div className={e.question}>
            <div className={e.qHead}>
              <span className={e.qNumber}>
                Question {q.number} of {questions.length}
              </span>
              <span className={s.row}>
                <Badge>{q.topic}</Badge>
                <Badge tone="info">
                  {q.marks} mark{q.marks === 1 ? '' : 's'}
                </Badge>
              </span>
            </div>
            <p className={e.prompt} id={`prompt-${q.id}`}>
              {q.prompt}
            </p>
            <AnswerInput q={q} value={a} onChange={(v) => change(q.id, v)} disabled={submitting} />
            <div className={e.nav}>
              <div className={e.navGroup}>
                <Button variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
                  Previous
                </Button>
                <Button variant="outline" onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))} disabled={current === questions.length - 1}>
                  Next
                </Button>
              </div>
              <Button
                variant="ghost"
                aria-pressed={flagged}
                onClick={() =>
                  setFlags((f) => {
                    const n = new Set(f);
                    if (n.has(q.id)) n.delete(q.id);
                    else n.add(q.id);
                    return n;
                  })
                }
              >
                <Flag size={16} aria-hidden /> {flagged ? 'Unmark review' : 'Mark for review'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Questions" className={e.paletteCard}>
          <div className={s.stackSm}>
            <p className={s.small}>
              {answeredCount} of {questions.length} answered
            </p>
            <ol className={e.palette} aria-label="Jump to question">
              {questions.map((x, i) => {
                const done = isAnswered(x, answers[x.id]);
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      className={`${e.cell} ${done ? e.cellAnswered : ''} ${i === current ? e.cellCurrent : ''} ${flags.has(x.id) ? e.cellFlag : ''}`}
                      aria-current={i === current ? 'step' : undefined}
                      aria-label={`Question ${x.number}${done ? ', answered' : ', not answered'}${flags.has(x.id) ? ', marked for review' : ''}`}
                      onClick={() => setCurrent(i)}
                    >
                      {x.number}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className={e.legend} aria-hidden>
              <span>
                <span className={`${e.swatch} ${e.swatchAnswered}`} />
                Answered
              </span>
              <span>
                <span className={`${e.swatch} ${e.swatchFlag}`} />
                For review
              </span>
            </div>
            <Button full onClick={() => setConfirmOpen(true)} loading={submitting} disabled={submitting}>
              Submit exam
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Submit your exam?"
        message={
          <>
            You have answered {answeredCount} of {questions.length} questions
            {flags.size ? ` and marked ${flags.size} for review` : ''}. After submitting you cannot change your answers.
          </>
        }
        confirmLabel="Submit"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => submit(false)}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className={e.saveState} role="status">
        <Loader2 size={14} aria-hidden /> Saving…
      </span>
    );
  if (state === 'saved')
    return (
      <span className={e.saveState} role="status">
        <CheckCircle2 size={14} aria-hidden /> All answers saved
      </span>
    );
  if (state === 'offline')
    return (
      <span className={`${e.saveState} ${e.saveBad}`} role="status">
        <CloudOff size={14} aria-hidden /> Offline — answers kept on this device, retrying
      </span>
    );
  if (state === 'error')
    return (
      <span className={`${e.saveState} ${e.saveBad}`} role="status">
        <AlertTriangle size={14} aria-hidden /> Not saved
      </span>
    );
  return <span className={e.saveState} role="status" />;
}

function AnswerInput({ q, value, onChange, disabled }: { q: ExamAttemptQuestion; value?: ExamAnswerValue; onChange: (v: ExamAnswerValue) => void; disabled: boolean }) {
  const selected = value?.selectedOptionIds ?? [];
  if (q.type === 'DESCRIPTIVE') {
    const text = value?.text ?? '';
    return (
      <Textarea
        label="Your answer"
        rows={10}
        maxLength={MAX_TEXT}
        value={text}
        disabled={disabled}
        hint={`${text.length.toLocaleString()} / ${MAX_TEXT.toLocaleString()} characters`}
        onChange={(ev) => onChange({ selectedOptionIds: [], text: ev.target.value })}
      />
    );
  }
  const multi = q.type === 'MULTI_CHOICE';
  return (
    <fieldset className={e.options} aria-describedby={`prompt-${q.id}`}>
      <legend className="sr-only">{multi ? 'Select all that apply' : 'Select one answer'}</legend>
      {multi && <p className={s.small}>Select all that apply.</p>}
      {q.options.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <label key={o.id} className={e.option}>
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`q-${q.id}`}
              value={o.id}
              checked={checked}
              disabled={disabled}
              onChange={() => {
                const next = multi ? (checked ? selected.filter((x) => x !== o.id) : [...selected, o.id]) : [o.id];
                onChange({ selectedOptionIds: next, text: null });
              }}
            />
            <span>{o.text}</span>
          </label>
        );
      })}
      {!multi && selected.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ selectedOptionIds: [], text: null })} disabled={disabled}>
          Clear selection
        </Button>
      )}
    </fieldset>
  );
}
