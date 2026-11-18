'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { EXAM_QUESTION_TYPES, EXAM_TRACKS, enumLabel } from '@globalantic/types';
import { Alert, Badge, Button, Checkbox, Input, Modal, Select, Textarea, type Tone } from '@globalantic/ui';
import s from './admin.module.css';

type Row = Record<string, any>;

export const TRACK_LABEL: Record<string, string> = { MARKETING: 'Marketing', SALES: 'Sales' };
export const KIND_LABEL: Record<string, string> = { TEST: 'Online test', PRACTICAL: 'Practical assessment', INTERVIEW: 'Interview stage' };
export const TYPE_LABEL: Record<string, string> = { SINGLE_CHOICE: 'Single choice', MULTI_CHOICE: 'Multiple select', TRUE_FALSE: 'True / false', DESCRIPTIVE: 'Written answer' };
export const trackOptions = EXAM_TRACKS.map((t) => ({ value: t, label: TRACK_LABEL[t] }));
export const typeOptions = EXAM_QUESTION_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }));
/** Suggested topics (free text is allowed). */
export const SUGGESTED_TOPICS = ['Communication', 'Lead generation', 'Sales fundamentals', 'Customer handling', 'Digital marketing', 'Practical scenarios'];

export function AttemptBadge({ r }: { r: Row }) {
  if (r.status === 'IN_PROGRESS') return <Badge tone="warning">In progress</Badge>;
  if (r.status === 'SUBMITTED') return <Badge tone="info">Needs evaluation</Badge>;
  const tone: Tone = r.passed ? 'success' : 'danger';
  return <Badge tone={tone}>{r.passed ? 'Pass' : 'Fail'}{r.percent !== null && r.percent !== undefined ? ` · ${r.percent}%` : ''}</Badge>;
}

/** ISO -> value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------------------
// Exam settings form
// ---------------------------------------------------------------------------

export interface ExamDraft {
  title: string;
  description: string;
  instructions: string;
  eligibilityNote: string;
  track: string;
  kind: string;
  durationMinutes: string;
  passPercent: string;
  maxAttempts: string;
  questionsPerAttempt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultVisibility: string;
  revealAnswers: boolean;
  negativeMarkPercent: string;
  interviewMaxMarks: string;
  opensAt: string;
  closesAt: string;
}

export const DEFAULT_INSTRUCTIONS =
  'Read each question carefully. The timer starts when you press Start and cannot be paused. Your answers are saved automatically; when time runs out they are submitted for you. Work on your own and do not share the questions.';

export function examDraft(x?: Row): ExamDraft {
  return {
    title: x?.title ?? '',
    description: x?.description ?? '',
    instructions: x?.instructions ?? DEFAULT_INSTRUCTIONS,
    eligibilityNote: x?.eligibilityNote ?? '',
    track: x?.track ?? 'MARKETING',
    kind: x?.kind ?? 'TEST',
    durationMinutes: String(x?.durationMinutes ?? 30),
    passPercent: String(x?.passPercent ?? 50),
    maxAttempts: String(x?.maxAttempts ?? 1),
    questionsPerAttempt: x?.questionsPerAttempt ? String(x.questionsPerAttempt) : '',
    shuffleQuestions: x?.shuffleQuestions ?? true,
    shuffleOptions: x?.shuffleOptions ?? true,
    resultVisibility: x?.resultVisibility ?? 'ON_RELEASE',
    revealAnswers: x?.revealAnswers ?? false,
    negativeMarkPercent: String(x?.negativeMarkPercent ?? 0),
    interviewMaxMarks: x?.interviewMaxMarks ? String(x.interviewMaxMarks) : '',
    opensAt: toLocalInput(x?.opensAt),
    closesAt: toLocalInput(x?.closesAt),
  };
}

export function examPayload(d: ExamDraft) {
  return {
    title: d.title,
    description: d.description || null,
    instructions: d.instructions,
    eligibilityNote: d.eligibilityNote || null,
    track: d.track,
    kind: d.kind,
    durationMinutes: d.durationMinutes,
    passPercent: d.passPercent,
    maxAttempts: d.maxAttempts,
    questionsPerAttempt: d.kind === 'INTERVIEW' ? null : d.questionsPerAttempt || null,
    shuffleQuestions: d.shuffleQuestions,
    shuffleOptions: d.shuffleOptions,
    resultVisibility: d.resultVisibility,
    revealAnswers: d.revealAnswers,
    negativeMarkPercent: d.kind === 'INTERVIEW' ? 0 : d.negativeMarkPercent || 0,
    interviewMaxMarks: d.kind === 'INTERVIEW' ? d.interviewMaxMarks || null : null,
    opensAt: fromLocalInput(d.opensAt),
    closesAt: fromLocalInput(d.closesAt),
  };
}

/** Settings fields. `locked` = published: scoring/structure fields are read-only (the server enforces it too). */
export function ExamFields({ d, set, errors, locked }: { d: ExamDraft; set: (p: Partial<ExamDraft>) => void; errors: Record<string, string>; locked: boolean }) {
  const interview = d.kind === 'INTERVIEW';
  return (
    <fieldset className={s.formGrid}>
      <Input containerClassName={s.span2} label="Title" required maxLength={200} value={d.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
      <Select label="Category" value={d.track} onChange={(e) => set({ track: e.target.value })} options={trackOptions} disabled={locked} error={errors.track} />
      <Select
        label="Type"
        value={d.kind}
        onChange={(e) => set({ kind: e.target.value })}
        options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
        disabled={locked}
        error={errors.kind}
      />
      <Textarea containerClassName={s.span2} label="Short description" rows={2} maxLength={2000} value={d.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />
      <Textarea containerClassName={s.span2} label="Instructions shown to students" required rows={5} maxLength={8000} value={d.instructions} onChange={(e) => set({ instructions: e.target.value })} error={errors.instructions} />
      <Textarea
        containerClassName={s.span2}
        label="Eligibility note"
        rows={2}
        maxLength={2000}
        hint="Shown before the student starts, e.g. who may take it and what to prepare. Access itself is controlled by the assignments."
        value={d.eligibilityNote}
        onChange={(e) => set({ eligibilityNote: e.target.value })}
        error={errors.eligibilityNote}
      />
      {interview ? (
        <Input label="Maximum interview marks" type="number" min={1} max={1000} required value={d.interviewMaxMarks} onChange={(e) => set({ interviewMaxMarks: e.target.value })} disabled={locked} error={errors.interviewMaxMarks} />
      ) : (
        <Input label="Time limit (minutes)" type="number" min={5} max={300} required value={d.durationMinutes} onChange={(e) => set({ durationMinutes: e.target.value })} disabled={locked} error={errors.durationMinutes} />
      )}
      <Input label="Pass mark (%)" type="number" min={0} max={100} required value={d.passPercent} onChange={(e) => set({ passPercent: e.target.value })} disabled={locked} error={errors.passPercent} />
      <Input label={interview ? 'Results per student' : 'Attempts allowed'} type="number" min={1} max={10} required value={d.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} error={errors.maxAttempts} />
      {!interview && (
        <Input
          label="Questions per attempt"
          type="number"
          min={1}
          hint="Leave empty to use every question. A smaller number draws a random set for each attempt."
          value={d.questionsPerAttempt}
          onChange={(e) => set({ questionsPerAttempt: e.target.value })}
          disabled={locked}
          error={errors.questionsPerAttempt}
        />
      )}
      {!interview && (
        <Input
          label="Negative marking (%)"
          type="number"
          min={0}
          max={100}
          hint="Share of a question's marks deducted for a wrong objective answer. 0 = off. Blank answers never lose marks."
          value={d.negativeMarkPercent}
          onChange={(e) => set({ negativeMarkPercent: e.target.value })}
          disabled={locked}
          error={errors.negativeMarkPercent}
        />
      )}
      <Input label="Opens" type="datetime-local" value={d.opensAt} onChange={(e) => set({ opensAt: e.target.value })} hint="Empty = available as soon as it is published." error={errors.opensAt} />
      <Input label="Closes" type="datetime-local" value={d.closesAt} onChange={(e) => set({ closesAt: e.target.value })} hint="Attempts in progress end at this time." error={errors.closesAt} />
      <Select
        label="Result visibility"
        value={d.resultVisibility}
        onChange={(e) => set({ resultVisibility: e.target.value })}
        options={[
          { value: 'ON_RELEASE', label: 'After I release results' },
          { value: 'IMMEDIATE', label: 'As soon as evaluated' },
        ]}
        error={errors.resultVisibility}
      />
      <div className={s.span2}>
        {!interview && (
          <>
            <Checkbox label="Shuffle question order for each student" checked={d.shuffleQuestions} onChange={(e) => set({ shuffleQuestions: e.target.checked })} disabled={locked} />
            <Checkbox label="Shuffle answer options" checked={d.shuffleOptions} onChange={(e) => set({ shuffleOptions: e.target.checked })} disabled={locked} />
          </>
        )}
        <Checkbox label="Show correct answers and explanations with results" checked={d.revealAnswers} onChange={(e) => set({ revealAnswers: e.target.checked })} />
      </div>
      {locked && <p className={`${s.small} ${s.span2}`}>This exam is published: category, type, time limit, pass mark, negative marking, question count and shuffling are fixed so every student is scored the same way.</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Question editor
// ---------------------------------------------------------------------------

interface OptionDraft {
  key: string;
  id?: string;
  text: string;
  correct: boolean;
}
let optSeq = 0;
const opt = (o?: Partial<OptionDraft>): OptionDraft => ({ key: `o${(optSeq += 1)}`, text: '', correct: false, ...o });
const TF = () => [opt({ text: 'True' }), opt({ text: 'False' })];

/** Create or edit a bank question. `question` = full staff view (includes the key). */
export function QuestionModal({ open, question, onClose, onSaved }: { open: boolean; question: Row | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(() => draftOf(question));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastId, setLastId] = useState<string | null | undefined>(undefined);
  if (open && lastId !== (question?.id ?? null)) {
    setLastId(question?.id ?? null);
    setV(draftOf(question));
    setErrors({});
    setError(null);
  }
  if (!open && lastId !== undefined) setLastId(undefined);

  const setType = (type: string) =>
    setV((x) => ({ ...x, type, options: type === 'TRUE_FALSE' ? TF() : type === 'DESCRIPTIVE' ? [] : x.options.length >= 2 && x.type !== 'TRUE_FALSE' ? x.options : [opt(), opt()] }));
  const setOption = (key: string, patch: Partial<OptionDraft>) =>
    setV((x) => ({
      ...x,
      options: x.options.map((o) => (o.key === key ? { ...o, ...patch } : patch.correct && x.type !== 'MULTI_CHOICE' ? { ...o, correct: false } : o)),
    }));

  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    const body = {
      track: v.track,
      topic: v.topic,
      type: v.type,
      prompt: v.prompt,
      marks: v.marks,
      guidance: v.guidance || null,
      explanation: v.explanation || null,
      options: v.type === 'DESCRIPTIVE' ? [] : v.options.map((o) => ({ ...(o.id ? { id: o.id } : {}), text: o.text, correct: o.correct })),
    };
    try {
      if (question?.id) await api().examAdmin.updateQuestion(question.id, body);
      else await api().examAdmin.createQuestion(body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  const choice = v.type !== 'DESCRIPTIVE';
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={question?.id ? 'Edit question' : 'New question'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} loading={pending}>Save question</Button>
        </>
      }
    >
      <div className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        {question?.locked && <Alert tone="warning">This question is used by a published exam or has answers, so it cannot be changed. Archive it and create a new one instead.</Alert>}
        <div className={s.formGrid}>
          <Select label="Category" value={v.track} onChange={(e) => setV({ ...v, track: e.target.value })} options={trackOptions} error={errors.track} />
          <Select label="Question type" value={v.type} onChange={(e) => setType(e.target.value)} options={typeOptions} error={errors.type} />
          <Input label="Topic" required list="exam-topic-suggestions" maxLength={80} value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} error={errors.topic} />
          <datalist id="exam-topic-suggestions">
            {SUGGESTED_TOPICS.map((t) => <option key={t} value={t} />)}
          </datalist>
          <Input label="Marks" type="number" min={1} max={100} required value={v.marks} onChange={(e) => setV({ ...v, marks: e.target.value })} error={errors.marks} />
          <Textarea containerClassName={s.span2} label="Question" required rows={4} maxLength={4000} value={v.prompt} onChange={(e) => setV({ ...v, prompt: e.target.value })} error={errors.prompt} />
        </div>
        {choice && (
          <fieldset className={s.stackSm} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.strong}>
              Options — mark {v.type === 'MULTI_CHOICE' ? 'every correct option' : 'the correct option'}
            </legend>
            {errors.options && <Alert tone="danger">{errors.options}</Alert>}
            {v.options.map((o, i) => (
              <div key={o.key} className={s.row}>
                <span className={s.toggleRow}>
                  <input
                    type={v.type === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                    name="correct-option"
                    id={`correct-${o.key}`}
                    checked={o.correct}
                    onChange={(e) => setOption(o.key, { correct: v.type === 'MULTI_CHOICE' ? e.target.checked : true })}
                  />
                  <label htmlFor={`correct-${o.key}`} className="sr-only">Option {i + 1} is correct</label>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input label={`Option ${i + 1}`} value={o.text} maxLength={500} onChange={(e) => setOption(o.key, { text: e.target.value })} disabled={v.type === 'TRUE_FALSE'} />
                </div>
                {v.type !== 'TRUE_FALSE' && v.options.length > 2 && (
                  <Button variant="ghost" size="sm" aria-label={`Remove option ${i + 1}`} onClick={() => setV({ ...v, options: v.options.filter((x) => x.key !== o.key) })}>
                    <Trash2 size={16} aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {v.type !== 'TRUE_FALSE' && v.options.length < 8 && (
              <div>
                <Button variant="outline" size="sm" onClick={() => setV({ ...v, options: [...v.options, opt()] })}>
                  <Plus size={16} aria-hidden /> Add option
                </Button>
              </div>
            )}
          </fieldset>
        )}
        <div className={s.formGrid}>
          {!choice && (
            <Textarea
              containerClassName={s.span2}
              label="Evaluator guidance (model answer / rubric)"
              rows={3}
              maxLength={4000}
              hint="Visible to evaluators only."
              value={v.guidance}
              onChange={(e) => setV({ ...v, guidance: e.target.value })}
            />
          )}
          <Textarea
            containerClassName={s.span2}
            label="Explanation"
            rows={2}
            maxLength={4000}
            hint="Shown to students with their result only if the exam reveals answers."
            value={v.explanation}
            onChange={(e) => setV({ ...v, explanation: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

function draftOf(q: Row | null) {
  const options: OptionDraft[] = q?.options
    ? (q.options as { id: string; text: string }[]).map((o) => opt({ id: o.id, text: o.text, correct: (q.correctOptionIds ?? []).includes(o.id) }))
    : [opt(), opt()];
  return {
    track: q?.track ?? 'MARKETING',
    topic: q?.topic ?? '',
    type: q?.type ?? 'SINGLE_CHOICE',
    prompt: q?.prompt ?? '',
    marks: String(q?.marks ?? 1),
    guidance: q?.guidance ?? '',
    explanation: q?.explanation ?? '',
    options: q?.type === 'DESCRIPTIVE' ? [] : options,
  };
}

export const typeLabel = (t: string) => TYPE_LABEL[t] ?? enumLabel(t);
