'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Download, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import {
  Alert,
  AsyncView,
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  Tabs,
  Textarea,
  Toolbar,
  formatDateTime,
  useAsync,
  useDebounced,
  useSession,
  useToast,
} from '@globalantic/ui';
import { downloadCsv, useConfirm, useRun } from '@/lib/admin';
import { AttemptBadge, ExamFields, KIND_LABEL, TRACK_LABEL, examDraft, examPayload, typeLabel } from '@/lib/exams';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;
type TabKey = 'settings' | 'questions' | 'candidates' | 'attempts' | 'report';

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const { ask, dialog } = useConfirm();
  const state = useAsync(() => api().examAdmin.exam(id), `exam-admin-${id}`);
  const [tab, setTab] = useState<TabKey>('settings');
  const manage = can('exams.manage');

  if (state.status === 404) return <ErrorState title="Exam not found" message="It may have been removed." />;

  return (
    <AsyncView state={state} loadingRows={6}>
      {(x) => {
        const interview = x.kind === 'INTERVIEW';
        const tabs: { value: TabKey; label: string; count?: number }[] = [
          { value: 'settings', label: 'Settings' },
          ...(!interview ? [{ value: 'questions' as const, label: 'Questions', count: x.questions.length }] : []),
          { value: 'candidates', label: 'Candidates', count: x.assignments.length },
          { value: 'attempts', label: interview ? 'Results' : 'Attempts', count: x._count?.attempts ?? 0 },
          { value: 'report', label: 'Report' },
        ];
        const actions = manage ? (
          <div className={s.actions}>
            {x.status === 'DRAFT' && (
              <Button
                size="sm"
                onClick={() =>
                  ask({
                    title: 'Publish this exam?',
                    message: 'Assigned candidates will be notified and can take it within the schedule. Scoring settings and questions are then fixed.',
                    confirmLabel: 'Publish',
                    onConfirm: async () => {
                      await api().examAdmin.publish(id);
                      state.reload();
                    },
                    success: 'Exam published',
                  })
                }
              >
                Publish
              </Button>
            )}
            {x.status !== 'DRAFT' && !x.resultsReleasedAt && x.resultVisibility === 'ON_RELEASE' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  ask({
                    title: 'Release results?',
                    message:
                      (x.attemptCounts?.SUBMITTED ?? 0) > 0
                        ? `${x.attemptCounts.SUBMITTED} attempt(s) still need evaluation; their results appear as soon as you evaluate them. Evaluated candidates are notified now.`
                        : 'Candidates with evaluated attempts will see their scores and be notified.',
                    confirmLabel: 'Release results',
                    onConfirm: async () => {
                      await api().examAdmin.releaseResults(id);
                      state.reload();
                    },
                    success: 'Results released',
                  })
                }
              >
                Release results
              </Button>
            )}
            {x.status !== 'ARCHIVED' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  ask({
                    title: 'Archive this exam?',
                    message: 'Candidates can no longer start it. Attempts still in progress are submitted as they are. Results stay available.',
                    confirmLabel: 'Archive',
                    tone: 'danger',
                    onConfirm: async () => {
                      await api().examAdmin.archive(id);
                      state.reload();
                    },
                    success: 'Exam archived',
                  })
                }
              >
                Archive
              </Button>
            )}
          </div>
        ) : undefined;

        return (
          <>
            <PageHeader
              eyebrow={<Link href="/exams" className={s.link}>← Exams</Link>}
              title={x.title}
              description={
                <span className={s.row}>
                  <StatusBadge status={x.status} />
                  <Badge tone="primary">{TRACK_LABEL[x.track]}</Badge>
                  <Badge>{KIND_LABEL[x.kind]}</Badge>
                  {x.resultsReleasedAt && <Badge tone="success">Results released</Badge>}
                </span>
              }
              actions={actions}
            />
            <Tabs label="Exam sections" value={tab} onChange={setTab} items={tabs} />
            <div className={s.spacer} />
            {tab === 'settings' && <SettingsTab exam={x} canEdit={manage} onSaved={state.reload} />}
            {tab === 'questions' && <QuestionsTab exam={x} canEdit={manage} onSaved={state.reload} />}
            {tab === 'candidates' && <CandidatesTab exam={x} canEdit={manage} onSaved={state.reload} />}
            {tab === 'attempts' && <AttemptsTab exam={x} onOpen={(aid) => router.push(`/exams/attempts/${aid}`)} onChanged={state.reload} />}
            {tab === 'report' && <ReportTab exam={x} />}
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}

// ---------------------------------------------------------------------------
function SettingsTab({ exam, canEdit, onSaved }: { exam: Row; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(() => examDraft(exam));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setD(examDraft(exam)), [exam]);
  const archived = exam.status === 'ARCHIVED';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await api().examAdmin.updateExam(exam.id, examPayload(d));
      toast('Exam updated', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  if (!canEdit || archived) {
    return (
      <Card title="Settings">
        <DescriptionList
          items={[
            { label: 'Time limit', value: exam.kind === 'INTERVIEW' ? '—' : `${exam.durationMinutes} minutes` },
            { label: 'Pass mark', value: `${exam.passPercent}%` },
            { label: 'Negative marking', value: exam.negativeMarkPercent ? `${exam.negativeMarkPercent}%` : 'Off' },
            { label: 'Attempts allowed', value: String(exam.maxAttempts) },
            { label: 'Opens', value: exam.opensAt ? formatDateTime(exam.opensAt) : 'On publish' },
            { label: 'Closes', value: exam.closesAt ? formatDateTime(exam.closesAt) : 'No closing time' },
            { label: 'Results', value: exam.resultVisibility === 'IMMEDIATE' ? 'As soon as evaluated' : 'On release' },
            { label: 'Total marks', value: String(exam.totalMarks) },
          ]}
        />
      </Card>
    );
  }
  return (
    <Card title="Settings">
      <form onSubmit={save} noValidate className={s.stack}>
        {error && <Alert tone="danger">{error}</Alert>}
        <ExamFields d={d} set={(p) => setD({ ...d, ...p })} errors={errors} locked={exam.status === 'PUBLISHED'} />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>Save settings</Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function QuestionsTab({ exam, canEdit, onSaved }: { exam: Row; canEdit: boolean; onSaved: () => void }) {
  const run = useRun();
  const editable = canEdit && exam.status === 'DRAFT';
  const [ids, setIds] = useState<string[]>(() => exam.questions.map((q: Row) => q.id));
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  useEffect(() => setIds(exam.questions.map((q: Row) => q.id)), [exam]);
  const q = useDebounced(search);
  const bank = useAsync(
    () => (editable ? api().examAdmin.questions({ track: exam.track, search: q, topic, page, pageSize: 10 }) : Promise.resolve(null)),
    `bank-${exam.id}-${q}-${topic}-${page}-${editable}`,
  );
  const topics = useAsync(() => (editable ? api().examAdmin.topics() : Promise.resolve([])), `topics-${editable}`);
  const known = useMemo(() => {
    const m = new Map<string, Row>();
    exam.questions.forEach((x: Row) => m.set(x.id, x));
    bank.data?.items.forEach((x: Row) => m.set(x.id, x));
    return m;
  }, [exam, bank.data]);
  const dirty = ids.join() !== exam.questions.map((x: Row) => x.id).join();
  const totalMarks = ids.reduce((sum, qid) => sum + (known.get(qid)?.marks ?? 0), 0);

  const move = (i: number, dir: -1 | 1) =>
    setIds((xs) => {
      const n = [...xs];
      const j = i + dir;
      if (j < 0 || j >= n.length) return xs;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = async () => {
    setSaving(true);
    const r = await run(() => api().examAdmin.setQuestions(exam.id, ids), 'Questions saved');
    setSaving(false);
    if (r) onSaved();
  };

  return (
    <div className={s.stack}>
      {!editable && exam.status !== 'DRAFT' && <Alert tone="info">Questions are fixed once the exam is published, so every candidate is scored on the same set.</Alert>}
      <Card
        title={`Selected questions (${ids.length}) · ${totalMarks} marks${exam.questionsPerAttempt ? ` · ${exam.questionsPerAttempt} drawn per attempt` : ''}`}
        actions={editable ? <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save selection</Button> : undefined}
      >
        {ids.length === 0 ? (
          <EmptyState title="No questions yet" description={editable ? 'Add questions from the bank below.' : undefined} />
        ) : (
          <ol className={s.list}>
            {ids.map((qid, i) => {
              const item = known.get(qid);
              return (
                <li key={qid} className={s.listItem}>
                  <div className={s.rowBetween}>
                    <span className={s.strong}>
                      {i + 1}. {typeLabel(item?.type ?? '')} · {item?.marks ?? '?'} mark{item?.marks === 1 ? '' : 's'} · {item?.topic}
                    </span>
                    {editable && (
                      <span className={s.actions}>
                        <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={16} aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === ids.length - 1}><ArrowDown size={16} aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Remove question ${i + 1}`} onClick={() => setIds((xs) => xs.filter((x) => x !== qid))}><Trash2 size={16} aria-hidden /></Button>
                      </span>
                    )}
                  </div>
                  <p className={s.preWrap}>{item?.prompt}</p>
                  {item?.options && (
                    <ul className={s.small}>
                      {(item.options as { id: string; text: string }[]).map((o) => (
                        <li key={o.id}>
                          {(item.correctOptionIds ?? []).includes(o.id) ? '✓ ' : '• '}
                          {o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {editable && (
        <Card title={`Add from the ${TRACK_LABEL[exam.track].toLowerCase()} question bank`} actions={<Link href="/exams/questions" className={s.link}>Manage bank</Link>}>
          <Toolbar>
            <Input label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <Select
              label="Topic"
              value={topic}
              placeholder="All topics"
              onChange={(e) => { setTopic(e.target.value); setPage(1); }}
              options={(topics.data ?? []).filter((t) => t.track === exam.track).map((t) => ({ value: t.topic, label: `${t.topic} (${t.count})` }))}
            />
          </Toolbar>
          <AsyncView state={bank} isEmpty={(d) => !d || d.items.length === 0} empty={{ title: 'No matching questions', description: 'Create questions for this category in the question bank.' }}>
            {(d) =>
              d && (
                <>
                  <DataTable<Row>
                    caption="Question bank"
                    rows={d.items}
                    rowKey={(r) => r.id}
                    columns={[
                      { key: 'prompt', header: 'Question', render: (r) => (<><span className={s.preWrap}>{r.prompt.length > 140 ? `${r.prompt.slice(0, 140)}…` : r.prompt}</span><div className={s.small}>{r.topic} · {typeLabel(r.type)} · {r.marks} mark(s)</div></>) },
                      {
                        key: 'add',
                        header: <span className="sr-only">Add</span>,
                        render: (r) =>
                          ids.includes(r.id) ? (
                            <Badge tone="success">Added</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setIds((xs) => [...xs, r.id])}>Add</Button>
                          ),
                      },
                    ]}
                  />
                  <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
                </>
              )
            }
          </AsyncView>
          {dirty && <p className={s.small}>Remember to save the selection above.</p>}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const TARGET_LABEL: Record<string, string> = { STUDENT: 'Individual intern', BATCH: 'Batch', INSTITUTION: 'College', PROGRAM: 'Internship role / programme' };

function describeAssignment(a: Row): string {
  if (a.target === 'STUDENT') return `${a.student?.name ?? 'Student'} (${a.student?.email ?? ''})`;
  if (a.target === 'BATCH') return `${a.batch?.name ?? 'Batch'} · ${a.batch?.course?.title ?? ''}`;
  if (a.target === 'PROGRAM') return a.course?.title ?? 'Programme';
  return a.institution ?? '';
}

function StudentPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const found = useAsync(() => (q.trim().length >= 2 ? api().examAdmin.targets(q) : Promise.resolve({ students: [] } as Row)), `stu-${q}`);
  const students = (found.data?.students ?? []) as Row[];
  return (
    <>
      <Input label="Find intern" placeholder="Name or email (2+ letters)" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select
        label="Intern"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.trim().length < 2 ? 'Search first' : students.length ? 'Choose…' : 'No matches'}
        options={students.map((st) => ({ value: st.id, label: `${st.name} · ${st.email}${st.institution ? ` · ${st.institution}` : ''}` }))}
        error={error}
      />
    </>
  );
}

function CandidatesTab({ exam, canEdit, onSaved }: { exam: Row; canEdit: boolean; onSaved: () => void }) {
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const targets = useAsync(() => (canEdit ? api().examAdmin.targets() : Promise.resolve(null)), `targets-${canEdit}`);
  const [target, setTarget] = useState('STUDENT');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const archived = exam.status === 'ARCHIVED';

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const key = target === 'STUDENT' ? 'studentId' : target === 'BATCH' ? 'batchId' : target === 'PROGRAM' ? 'courseId' : 'institution';
    if (!value.trim()) {
      setErrors({ [key]: 'Required' });
      return;
    }
    setPending(true);
    try {
      await api().examAdmin.assign(exam.id, { target, [key]: value.trim() });
      setValue('');
      onSaved();
    } catch (err) {
      setErrors(fieldErrorMap(err));
      await run(() => Promise.reject(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={s.grid2}>
      <Card title="Assigned to">
        {exam.assignments.length === 0 ? (
          <EmptyState title="Not assigned yet" description="Only assigned interns can see and take this exam." />
        ) : (
          <ul className={s.list}>
            {exam.assignments.map((a: Row) => (
              <li key={a.id} className={s.listItem}>
                <div className={s.rowBetween}>
                  <span>
                    <Badge>{TARGET_LABEL[a.target]}</Badge> <span className={s.strong}>{describeAssignment(a)}</span>
                  </span>
                  {canEdit && !archived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        ask({
                          title: 'Remove this assignment?',
                          message: 'Interns in this group who have not started can no longer see the exam. Existing attempts and results are kept.',
                          confirmLabel: 'Remove',
                          tone: 'danger',
                          onConfirm: async () => {
                            await api().examAdmin.unassign(exam.id, a.id);
                            onSaved();
                          },
                          success: 'Assignment removed',
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <span className={s.small}>Added {formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canEdit && !archived && (
        <Card title="Assign">
          <form onSubmit={add} noValidate className={s.stackSm}>
            <Select
              label="Assign to"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setValue('');
                setErrors({});
              }}
              options={Object.entries(TARGET_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            />
            {target === 'STUDENT' && <StudentPicker value={value} onChange={setValue} error={errors.studentId} />}
            {target === 'BATCH' && (
              <Select label="Batch" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Choose a batch" options={((targets.data?.batches ?? []) as Row[]).map((b) => ({ value: b.id, label: `${b.name} · ${b.course}` }))} error={errors.batchId} />
            )}
            {target === 'PROGRAM' && (
              <Select
                label="Internship role / programme"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Choose a programme"
                options={((targets.data?.programs ?? []) as Row[]).map((p) => ({ value: p.id, label: `${p.title}${p.programType === 'INTERNSHIP' ? ' (internship)' : ''}` }))}
                hint="Every intern with an active enrollment in this programme."
                error={errors.courseId}
              />
            )}
            {target === 'INSTITUTION' && (
              <>
                <Input label="College" list="exam-colleges" value={value} onChange={(e) => setValue(e.target.value)} hint="Matches the college in the intern's profile (not case-sensitive)." error={errors.institution} />
                <datalist id="exam-colleges">
                  {((targets.data?.institutions ?? []) as Row[]).map((i) => <option key={i.name} value={i.name}>{`${i.students} interns`}</option>)}
                </datalist>
              </>
            )}
            <div className={s.actions}>
              <Button type="submit" loading={pending}>Assign</Button>
            </div>
            {exam.status === 'PUBLISHED' && <p className={s.small}>Interns in the new group are notified immediately.</p>}
          </form>
        </Card>
      )}
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AttemptsTab({ exam, onOpen, onChanged }: { exam: Row; onOpen: (id: string) => void; onChanged: () => void }) {
  const { can } = useSession();
  const { ask, dialog } = useConfirm();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const state = useAsync(() => api().examAdmin.attempts(exam.id, { status, search: q, page, pageSize: 20 }), `attempts-${exam.id}-${status}-${q}-${page}`);
  const interview = exam.kind === 'INTERVIEW';

  return (
    <div className={s.stack}>
      {interview && can('exams.evaluate') && exam.status === 'PUBLISHED' && (
        <InterviewForm
          exam={exam}
          onSaved={() => {
            state.reload();
            onChanged();
          }}
        />
      )}
      <Toolbar>
        <Input label="Search" placeholder="Name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select
          label="Status"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          placeholder="All"
          options={[
            { value: 'IN_PROGRESS', label: 'In progress' },
            { value: 'SUBMITTED', label: 'Needs evaluation' },
            { value: 'EVALUATED', label: 'Evaluated' },
          ]}
        />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: interview ? 'No results recorded' : 'No attempts yet', description: interview ? 'Record a result after each interview.' : 'Attempts appear here as soon as candidates start.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Attempts"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => onOpen(r.id)}
              columns={[
                { key: 'student', header: 'Candidate', render: (r) => (<><Link href={`/exams/students/${r.student.id}`} className={s.link} onClick={(e) => e.stopPropagation()}>{r.student.name}</Link><div className={s.small}>{r.student.email}{r.student.institution ? ` · ${r.student.institution}` : ''}</div></>) },
                { key: 'no', header: '#', hideOnMobile: true, render: (r) => r.attemptNo },
                { key: 'when', header: 'Submitted', hideOnMobile: true, render: (r) => (r.submittedAt ? <>{formatDateTime(r.submittedAt)}{r.autoSubmitted && <div className={s.small}>auto (time up)</div>}</> : <span className={s.small}>started {formatDateTime(r.startedAt)}</span>) },
                { key: 'score', header: 'Score', render: (r) => (r.score === null ? '—' : `${r.score} / ${r.maxScore}`) },
                { key: 'focus', header: 'Tab switches', hideOnMobile: true, render: (r) => (interview ? '—' : r.focusLossCount) },
                { key: 'status', header: 'Status', render: (r) => <AttemptBadge r={r} /> },
                ...(can('exams.manage') && exam.status === 'PUBLISHED'
                  ? [
                      {
                        key: 'retake',
                        header: <span className="sr-only">Retake</span>,
                        hideOnMobile: true,
                        render: (r: Row) =>
                          r.status !== 'IN_PROGRESS' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                ask({
                                  title: `Allow ${r.student.name} another attempt?`,
                                  message: 'One extra attempt is granted. The reason is kept in the audit log.',
                                  confirmLabel: 'Grant retake',
                                  requireReason: true,
                                  onConfirm: async (reason) => {
                                    await api().examAdmin.grantRetake(exam.id, r.student.id, reason);
                                    onChanged();
                                  },
                                  success: 'Retake granted',
                                });
                              }}
                            >
                              Retake
                            </Button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
            <p className={s.small}>Tab switches are reported by the candidate&apos;s browser and are informational only.</p>
          </>
        )}
      </AsyncView>
      {dialog}
    </div>
  );
}

function InterviewForm({ exam, onSaved }: { exam: Row; onSaved: () => void }) {
  const run = useRun();
  const [studentId, setStudentId] = useState('');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setPending(true);
    try {
      await api().examAdmin.recordInterview(exam.id, { studentId, score: Number(score), feedback: feedback || null });
      setStudentId('');
      setScore('');
      setFeedback('');
      onSaved();
      await run(() => Promise.resolve(), 'Interview result recorded');
    } catch (err) {
      setErrors(fieldErrorMap(err));
      await run(() => Promise.reject(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="Record an interview result">
      <form onSubmit={save} noValidate className={s.formGrid}>
        <StudentPicker value={studentId} onChange={setStudentId} error={errors.studentId} />
        <Input label={`Score (out of ${exam.interviewMaxMarks})`} type="number" min={0} max={exam.interviewMaxMarks} step="0.5" required value={score} onChange={(e) => setScore(e.target.value)} error={errors.score} />
        <Textarea containerClassName={s.span2} label="Feedback for the candidate" rows={3} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <div className={`${s.actions} ${s.span2}`}>
          <Button type="submit" loading={pending} disabled={!studentId || score === ''}>Save result</Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function ReportTab({ exam }: { exam: Row }) {
  const run = useRun();
  const state = useAsync(() => api().examAdmin.report(exam.id), `exam-report-${exam.id}`);
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    const r = await run(() => api().examAdmin.exportResults(exam.id));
    setExporting(false);
    if (!r) return;
    if (!r.rows.length) {
      await run(() => Promise.reject(new Error('There are no attempts to export yet.')));
      return;
    }
    downloadCsv(`exam-results-${exam.title.replace(/\W+/g, '-').toLowerCase()}.csv`, r.rows);
  };
  return (
    <AsyncView state={state} loadingRows={4}>
      {(r) => (
        <div className={s.stack}>
          <div className={s.rowBetween}>
            <p className={s.muted}>Based on submitted attempts. Averages use evaluated attempts only.</p>
            <Button size="sm" variant="outline" onClick={exportCsv} loading={exporting}><Download size={16} aria-hidden /> Export results (CSV)</Button>
          </div>
          <StatGrid>
            <Stat label="Candidates" value={r.students} />
            <Stat label="Attempts" value={r.attempts} hint={r.autoSubmitted ? `${r.autoSubmitted} auto-submitted` : undefined} />
            <Stat label="Needs evaluation" value={r.pendingEvaluation} tone={r.pendingEvaluation ? 'warning' : undefined} />
            <Stat label="Passed" value={r.passed} tone="success" hint={`${r.failed} not passed`} />
            <Stat label="Average" value={r.averagePercent === null ? '—' : `${r.averagePercent}%`} hint={r.highestPercent === null ? undefined : `High ${r.highestPercent}% · low ${r.lowestPercent}%`} />
          </StatGrid>
          {r.byTopic.length > 0 && (
            <Card title="By topic">
              <DataTable<Row> caption="Average score by topic" rows={r.byTopic} rowKey={(t) => t.topic} columns={[{ key: 'topic', header: 'Topic', render: (t) => t.topic }, { key: 'avg', header: 'Average', render: (t) => (t.averagePercent === null ? '—' : `${t.averagePercent}%`) }]} />
            </Card>
          )}
          {r.byQuestion.length > 0 && (
            <Card title="By question">
              <DataTable<Row>
                caption="Average score by question"
                rows={r.byQuestion}
                rowKey={(x) => x.questionId}
                columns={[
                  { key: 'q', header: 'Question', render: (x) => (<><span className={s.preWrap}>{x.prompt.length > 120 ? `${x.prompt.slice(0, 120)}…` : x.prompt}</span><div className={s.small}>{x.topic} · {typeLabel(x.type)}</div></>) },
                  { key: 'shown', header: 'Shown', hideOnMobile: true, render: (x) => x.shown },
                  { key: 'avg', header: 'Average', render: (x) => (x.averagePercent === null ? 'Not marked yet' : `${x.averagePercent}%`) },
                ]}
              />
            </Card>
          )}
        </div>
      )}
    </AsyncView>
  );
}
