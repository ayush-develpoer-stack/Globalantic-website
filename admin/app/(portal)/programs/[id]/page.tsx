'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, Checkbox, Input, Modal, PageHeader, StatusBadge, Tabs, Textarea, buttonClass, formatINR, useAsync, useSession, useToast } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import { ProgramFields, programFromApi, programToApi, type ProgramForm } from '@/lib/programs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function SettingsCard({ p, canManage, onSaved }: { p: Row; canManage: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<ProgramForm>(programFromApi(p));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setV(programFromApi(p)), [p]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = programToApi(v);
    if ('error' in body) return setError(body.error);
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await api().programAdmin.updateProgram(p.id, body.data);
      toast('Program saved', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="Program details">
      <form onSubmit={save} noValidate className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <ProgramFields value={v} onChange={setV} errors={errors} disabled={!canManage} />
        {canManage && (
          <div className={s.actions}>
            <Button type="submit" loading={pending}>Save</Button>
          </div>
        )}
      </form>
    </Card>
  );
}

interface LessonForm {
  title: string;
  body: string;
  videoUrl: string;
  minMinutes: string;
  required: boolean;
  position: string;
}

function LessonModal({ programId, lesson, onClose, onSaved }: { programId: string; lesson: Row | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<LessonForm>({ title: '', body: '', videoUrl: '', minMinutes: '0', required: true, position: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (lesson && lesson !== 'new') setV({ title: lesson.title, body: lesson.body, videoUrl: lesson.videoUrl ?? '', minMinutes: String(lesson.minMinutes), required: lesson.required, position: String(lesson.position) });
    else setV({ title: '', body: '', videoUrl: '', minMinutes: '0', required: true, position: '' });
    setError(null);
    setErrors({});
  }, [lesson]);
  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    const body = { title: v.title.trim(), body: v.body.trim(), videoUrl: v.videoUrl.trim() || null, minMinutes: Number.parseInt(v.minMinutes || '0', 10), required: v.required, ...(v.position.trim() ? { position: Number.parseInt(v.position, 10) } : {}) };
    try {
      if (lesson === 'new') await api().programAdmin.addLesson(programId, body);
      else if (lesson) await api().programAdmin.updateLesson(programId, lesson.id, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={lesson !== null} onClose={onClose} title={lesson === 'new' ? 'Add lesson' : 'Edit lesson'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save lesson</Button></>}>
      <div className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Title" required maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={errors.title} />
        <Textarea label="Lesson content" rows={10} required maxLength={50000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} error={errors.body} />
        <div className={s.formGrid}>
          <Input label="Video link (optional, https)" maxLength={1000} value={v.videoUrl} onChange={(e) => setV({ ...v, videoUrl: e.target.value })} error={errors.videoUrl} />
          <Input label="Minimum minutes before completion" inputMode="numeric" value={v.minMinutes} onChange={(e) => setV({ ...v, minMinutes: e.target.value })} error={errors.minMinutes} hint="Counted from when the student first opens the lesson" />
          <Input label="Position (optional)" inputMode="numeric" value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} error={errors.position} />
          <div className={s.filterCheck}>
            <Checkbox label="Required for the certificate" checked={v.required} onChange={(e) => setV({ ...v, required: e.target.checked })} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function QuestionModal({ programId, question, onClose, onSaved }: { programId: string; question: Row | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (question && question !== 'new') {
      setPrompt(question.prompt);
      setOptions(question.options as string[]);
      setCorrect(question.correctIndex);
      setExplanation(question.explanation ?? '');
    } else {
      setPrompt('');
      setOptions(['', '']);
      setCorrect(0);
      setExplanation('');
    }
    setError(null);
    setErrors({});
  }, [question]);
  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    const body = { prompt: prompt.trim(), options: options.map((o) => o.trim()), correctIndex: correct, explanation: explanation.trim() || null };
    try {
      if (question === 'new') await api().programAdmin.addQuestion(programId, body);
      else if (question) await api().programAdmin.updateQuestion(programId, question.id, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={question !== null} onClose={onClose} title={question === 'new' ? 'Add question' : 'Edit question'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save question</Button></>}>
      <div className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Textarea label="Question" rows={3} required maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} error={errors.prompt} />
        <fieldset className={s.stackSm} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={s.strong}>Options (select the correct answer)</legend>
          {options.map((o, i) => (
            <div key={i} className={s.row}>
              <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={correct === i} onChange={() => setCorrect(i)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input label={`Option ${i + 1}`} maxLength={500} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} error={errors[`options.${i}`]} />
              </div>
              {options.length > 2 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setOptions(options.filter((_, j) => j !== i)); setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c)); }}>Remove</Button>
              )}
            </div>
          ))}
          {options.length < 6 && <div><Button type="button" size="sm" variant="outline" onClick={() => setOptions([...options, ''])}>Add option</Button></div>}
          {errors.correctIndex && <Alert tone="danger">{errors.correctIndex}</Alert>}
        </fieldset>
        <Textarea label="Explanation (staff only, optional)" rows={2} maxLength={2000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const canManage = can('programs.manage');
  const { ask, dialog } = useConfirm();
  const [tab, setTab] = useState<'details' | 'lessons' | 'questions'>('details');
  const [lesson, setLesson] = useState<Row | 'new' | null>(null);
  const [question, setQuestion] = useState<Row | 'new' | null>(null);
  const state = useAsync(() => api().programAdmin.program(id), `program-${id}`);

  const setStatus = (p: Row, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') =>
    ask({
      title: status === 'PUBLISHED' ? 'Publish this program?' : status === 'ARCHIVED' ? 'Archive this program?' : 'Move back to draft?',
      message:
        status === 'PUBLISHED'
          ? 'It becomes visible on the training website and students can register and pay. It needs at least one required lesson and one assessment question.'
          : 'New registrations stop. Existing enrollments keep their access.',
      confirmLabel: status === 'PUBLISHED' ? 'Publish' : status === 'ARCHIVED' ? 'Archive' : 'Move to draft',
      onConfirm: async () => {
        await api().programAdmin.updateProgram(p.id, { status });
        state.reload();
      },
      success: 'Status updated',
    });

  return (
    <AsyncView state={state} loadingRows={6}>
      {(p) => {
        const lessons = (p.lessons as Row[]) ?? [];
        const questions = (p.questions as Row[]) ?? [];
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/programs" className={s.link}>← Programs</Link>}
              title={p.title}
              description={<span className={s.row}><StatusBadge status={p.status} /> <span>{formatINR(p.feePaise)}</span> <span className={s.small}>{p._count.enrollments} enrollment(s)</span></span>}
              actions={
                <div className={s.actions}>
                  <Link href={`/programs/enrollments?programId=${p.id}`} className={buttonClass('outline', 'sm')}>Enrollments</Link>
                  {canManage && p.status !== 'PUBLISHED' && <Button size="sm" onClick={() => setStatus(p, 'PUBLISHED')}>Publish</Button>}
                  {canManage && p.status === 'PUBLISHED' && <Button size="sm" variant="outline" onClick={() => setStatus(p, 'DRAFT')}>Unpublish</Button>}
                  {canManage && p.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={() => setStatus(p, 'ARCHIVED')}>Archive</Button>}
                </div>
              }
            />
            <Tabs
              label="Program sections"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'details', label: 'Details' },
                { value: 'lessons', label: 'Lessons', count: lessons.filter((l) => !l.archivedAt).length },
                { value: 'questions', label: 'Assessment questions', count: questions.filter((q) => !q.archivedAt).length },
              ]}
            />
            <div className={s.spacer} />
            {tab === 'details' && <SettingsCard p={p} canManage={canManage} onSaved={state.reload} />}
            {tab === 'lessons' && (
              <Card title="Lessons" actions={canManage ? <Button size="sm" onClick={() => setLesson('new')}>Add lesson</Button> : undefined}>
                {lessons.length === 0 ? (
                  <p className={s.muted}>No lessons yet. Every required lesson must be completed before the final assessment.</p>
                ) : (
                  <ul className={s.list}>
                    {lessons.map((l) => (
                      <li key={l.id} className={s.listItem}>
                        <div className={s.rowBetween}>
                          <span className={s.strong}>{l.position}. {l.title}</span>
                          <span className={s.row}>
                            {l.required ? <Badge tone="primary">Required</Badge> : <Badge>Optional</Badge>}
                            {l.minMinutes > 0 && <Badge>{l.minMinutes} min</Badge>}
                            {l.archivedAt && <Badge tone="warning">Archived</Badge>}
                          </span>
                        </div>
                        <p className={`${s.small} ${s.preWrap}`}>{String(l.body).slice(0, 240)}{String(l.body).length > 240 ? '…' : ''}</p>
                        {canManage && (
                          <div className={s.actions}>
                            <Button size="sm" variant="outline" onClick={() => setLesson(l)}>Edit</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => ask({ title: l.archivedAt ? 'Restore lesson?' : 'Archive lesson?', message: l.archivedAt ? undefined : 'Students will no longer see it and it stops counting towards completion.', confirmLabel: l.archivedAt ? 'Restore' : 'Archive', onConfirm: async () => { await api().programAdmin.archiveLesson(p.id, l.id, !l.archivedAt); state.reload(); }, success: 'Lesson updated' })}
                            >
                              {l.archivedAt ? 'Restore' : 'Archive'}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {tab === 'questions' && (
              <Card title="Final assessment question bank" actions={canManage ? <Button size="sm" onClick={() => setQuestion('new')}>Add question</Button> : undefined}>
                <p className={s.muted}>Pass mark {p.passPercent}% · {p.questionsPerAttempt ?? 'all'} question(s) per attempt · {p.timeLimitMinutes} minutes · {p.maxAttempts} attempt(s). Answer keys are only visible to staff and are never sent to students.</p>
                <div className={s.spacer} />
                {questions.length === 0 ? (
                  <p className={s.muted}>No questions yet.</p>
                ) : (
                  <ul className={s.list}>
                    {questions.map((q, i) => (
                      <li key={q.id} className={s.listItem}>
                        <div className={s.rowBetween}>
                          <span className={s.strong}>{i + 1}. {q.prompt}</span>
                          {q.archivedAt && <Badge tone="warning">Archived</Badge>}
                        </div>
                        <ol style={{ paddingLeft: 18 }}>
                          {(q.options as string[]).map((o, j) => (
                            <li key={j} className={j === q.correctIndex ? s.strong : s.muted}>{o}{j === q.correctIndex ? ' ✓' : ''}</li>
                          ))}
                        </ol>
                        {canManage && (
                          <div className={s.actions}>
                            <Button size="sm" variant="outline" onClick={() => setQuestion(q)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => ask({ title: q.archivedAt ? 'Restore question?' : 'Archive question?', confirmLabel: q.archivedAt ? 'Restore' : 'Archive', onConfirm: async () => { await api().programAdmin.archiveQuestion(p.id, q.id, !q.archivedAt); state.reload(); }, success: 'Question updated' })}>
                              {q.archivedAt ? 'Restore' : 'Archive'}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            <LessonModal programId={p.id} lesson={lesson} onClose={() => setLesson(null)} onSaved={state.reload} />
            <QuestionModal programId={p.id} question={question} onClose={() => setQuestion(null)} onSaved={state.reload} />
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}
