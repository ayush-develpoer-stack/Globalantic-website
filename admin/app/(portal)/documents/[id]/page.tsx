'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DataTable, DescriptionList, ErrorState, Input, Modal, PageHeader, Select, StatusBadge, Textarea, buttonClass, formatDate, formatDateTime, formatINR, rupeesToPaise, todayIso, useAsync, useSession, useToast } from '@globalantic/ui';
import { useConfirm, useRun } from '@/lib/admin';
import { AuditHistory } from '@/lib/AuditHistory';
import { DocumentFields, docFromApi, docToApi, type DocForm } from '@/lib/DocumentEditor';
import { DOC_TYPE_LABEL, EmailLogList, PAYMENT_METHODS, PartyFields, TotalsList, deliveryMessage, partyFromRow, partyToApi, type PartyForm } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function DraftEditor({ d, gstAvailable, onSaved }: { d: Row; gstAvailable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<DocForm>(docFromApi(d));
  const [party, setParty] = useState<PartyForm>(partyFromRow(d.party));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setV(docFromApi(d));
    setParty(partyFromRow(d.party));
  }, [d]);
  const save = async () => {
    const r = docToApi(d.type, v);
    if ('error' in r) return setError(r.error);
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await api().documents.update(d.id, { ...r.body, party: partyToApi(party) });
      toast('Draft saved', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card title={d.type === 'INVOICE' ? 'Bill to' : 'Client'}>
        <PartyFields value={party} onChange={setParty} errors={errors} prefix="party." />
      </Card>
      <DocumentFields type={d.type} value={v} onChange={setV} errors={errors} gstAvailable={gstAvailable} />
      <div className={s.actions}>
        <Button onClick={save} loading={pending}>Save draft</Button>
      </div>
    </div>
  );
}

function SendModal({ d, open, onClose, onDone }: { d: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) {
      setTo(d.party?.email ?? '');
      setCc('');
      setMessage('');
      setError(null);
    }
  }, [open, d]);
  const send = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await api().documents.send(d.id, { to: to.trim() || undefined, cc: cc.split(',').map((x) => x.trim()).filter(Boolean), message: message.trim() || null });
      const msg = deliveryMessage(r.data.delivery, r.data.error);
      if (r.data.delivery === 'SENT') {
        toast(msg, 'success');
        onClose();
      } else setError(msg);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Email ${d.number}`} footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={send} loading={pending}>Send with PDF</Button></>}>
      <div className={s.stackSm}>
        {error && <Alert tone="warning">{error}</Alert>}
        <Input label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input label="Cc (optional, comma separated)" value={cc} onChange={(e) => setCc(e.target.value)} />
        <Textarea label="Message (optional)" rows={4} maxLength={3000} value={message} onChange={(e) => setMessage(e.target.value)} hint="The PDF is attached. Delivery is recorded in the email log." />
      </div>
    </Modal>
  );
}

function SignedModal({ d, open, onClose, onDone }: { d: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [signedOn, setSignedOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (!file) return setError('Choose the signed copy (PDF or image).');
    setPending(true);
    setError(null);
    try {
      const meta = await api().files.upload(file, 'SIGNED_DOCUMENT');
      await api().documents.recordSigned(d.id, { fileId: meta.id, signedOn, note: note.trim() });
      toast('Signed copy recorded', 'success');
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record the signed agreement" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Upload and mark signed</Button></>}>
      <div className={s.stackSm}>
        <Alert tone="info">No e-signature service is connected. An agreement is marked “Signed” only by uploading the copy signed by both parties.</Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Signed copy (PDF, PNG, JPEG, WEBP · max 5 MB)" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Input label="Signed on" type="date" max={todayIso()} value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
        <Textarea label="Who signed, and how" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} hint='e.g. "Signed by R. Sharma (Director) and our signatory; scanned copy"' />
      </div>
    </Modal>
  );
}

function PaymentModal({ d, open, onClose, onDone }: { d: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const balance = Math.max(0, d.totalPaise - d.amountPaidPaise);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(String(balance / 100));
      setError(null);
      setErrors({});
    }
  }, [open, balance]);
  const save = async () => {
    const amountPaise = rupeesToPaise(amount);
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) return setError('Enter the amount received.');
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const r = await api().documents.recordPayment(d.id, { amountPaise, method, reference: reference.trim(), paidOn, note: note.trim() || null });
      toast(`Payment recorded — receipt ${r.number}`, 'success');
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Record payment on ${d.number}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Record and issue receipt</Button></>}>
      <div className={s.stackSm}>
        <p className={s.muted}>Record money that has actually been received. Balance due: {formatINR(balance)}.</p>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className={s.formGrid}>
          <Input label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amountPaise} />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS} />
          <Input label="Reference (UTR / cheque no.)" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} />
          <Input label="Paid on" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} />
        </div>
        <Textarea label="Note (optional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const [modal, setModal] = useState<'send' | 'signed' | 'payment' | null>(null);
  const state = useAsync(() => api().documents.get(id), `document-${id}`);
  const profile = useAsync(() => api().documents.profile(), 'doc-profile');
  if (state.status === 404) return <ErrorState title="Document not found" message="It does not exist or you do not have access to it." />;

  return (
    <AsyncView state={state} loadingRows={6}>
      {(d) => {
        const canEdit = Boolean(d.permissions?.canEdit);
        const draft = d.status === 'DRAFT';
        const live = !draft && d.status !== 'VOID' && d.status !== 'SUPERSEDED';
        const lines: Row[] = (d.totals?.lines as Row[]) ?? [];
        const receipts = ((d.derived as Row[]) ?? []).filter((x) => x.type === 'RECEIPT');
        const others = ((d.derived as Row[]) ?? []).filter((x) => x.type !== 'RECEIPT');
        const go = async (fn: () => Promise<Row>, msg: string) => {
          const r = await run(fn, msg);
          if (r?.id && r.id !== d.id) router.push(`/documents/${r.id}`);
          else state.reload();
        };
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>}
              title={d.title}
              description={
                <span className={s.row}>
                  <Badge tone="primary">{DOC_TYPE_LABEL[d.type]}</Badge>
                  <StatusBadge status={d.status} />
                  <span className={s.mono}>{d.number ?? 'Not issued'}</span>
                  {d.revision > 1 && <Badge>Rev. {d.revision}</Badge>}
                </span>
              }
              actions={
                <div className={s.actions}>
                  <a className={buttonClass('outline', 'sm')} href={api().documents.pdfUrl(d.id)} target="_blank" rel="noopener noreferrer">{draft ? 'Preview PDF' : 'View PDF'}</a>
                  {!draft && <a className={buttonClass('outline', 'sm')} href={api().documents.pdfUrl(d.id, true)}>Download</a>}
                  {canEdit && draft && (
                    <>
                      <Button size="sm" onClick={() => ask({ title: `Issue this ${DOC_TYPE_LABEL[d.type].toLowerCase()}?`, message: 'It gets the next number, which can never be reused, and becomes read-only. Company details are frozen as they are now.', confirmLabel: 'Issue', onConfirm: async () => { await api().documents.issue(d.id); state.reload(); }, success: 'Document issued' })}>Issue</Button>
                      <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Delete this draft?', tone: 'danger', confirmLabel: 'Delete', onConfirm: async () => { await api().documents.remove(d.id); router.push('/documents'); }, success: 'Draft deleted' })}>Delete</Button>
                    </>
                  )}
                  {canEdit && live && <Button size="sm" onClick={() => setModal('send')}>Send by email</Button>}
                </div>
              }
            />
            <div className={s.stack}>
              {d.status === 'VOID' && <Alert tone="warning" title="Void">{d.voidReason}</Alert>}
              {d.status === 'SUPERSEDED' && <Alert tone="info">This document was replaced by a newer revision.</Alert>}
              {d.type === 'AGREEMENT' && !draft && d.status !== 'SIGNED' && d.status !== 'VOID' && <Alert tone="info">Not signed. The agreement becomes binding only when signed by both parties; upload the signed copy to record it.</Alert>}

              {canEdit && live && (
                <Card title="Next steps">
                  <div className={s.actions}>
                    {(d.type === 'QUOTATION' || d.type === 'PROPOSAL') && (d.status === 'ISSUED' || d.status === 'SENT') && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => ask({ title: 'Record acceptance', requireReason: true, reasonLabel: 'How did the client accept? (e.g. “Accepted by email on 12 Oct”)', confirmLabel: 'Mark accepted', onConfirm: async (note) => { await api().documents.outcome(d.id, 'ACCEPTED', note); state.reload(); }, success: 'Marked accepted' })}>Mark accepted</Button>
                        <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Record decline', requireReason: true, reasonLabel: 'What did the client say?', confirmLabel: 'Mark declined', onConfirm: async (note) => { await api().documents.outcome(d.id, 'DECLINED', note); state.reload(); }, success: 'Marked declined' })}>Mark declined</Button>
                      </>
                    )}
                    {(d.type === 'QUOTATION' || d.type === 'PROPOSAL') && d.status === 'ACCEPTED' && (
                      <>
                        {can('documents.manage') && <Button size="sm" onClick={() => go(() => api().documents.convert(d.id, 'AGREEMENT'), 'Agreement draft created')}>Create agreement</Button>}
                        {can('documents.finance') && <Button size="sm" variant="outline" onClick={() => go(() => api().documents.convert(d.id, 'INVOICE'), 'Invoice draft created')}>Create invoice</Button>}
                      </>
                    )}
                    {d.type === 'AGREEMENT' && d.status === 'SIGNED' && can('documents.finance') && <Button size="sm" onClick={() => go(() => api().documents.convert(d.id, 'INVOICE'), 'Invoice draft created')}>Create invoice</Button>}
                    {d.type === 'AGREEMENT' && (d.status === 'ISSUED' || d.status === 'SENT') && <Button size="sm" onClick={() => setModal('signed')}>Record signed copy</Button>}
                    {['QUOTATION', 'PROPOSAL', 'AGREEMENT'].includes(d.type) && ['ISSUED', 'SENT', 'DECLINED'].includes(d.status) && <Button size="sm" variant="outline" onClick={() => go(() => api().documents.revise(d.id), 'Revision draft ready')}>Revise</Button>}
                    {d.type === 'INVOICE' && ['ISSUED', 'SENT', 'PARTIALLY_PAID'].includes(d.status) && can('documents.finance') && <Button size="sm" onClick={() => setModal('payment')}>Record payment</Button>}
                    <Button size="sm" variant="danger" onClick={() => ask({ title: 'Void this document?', message: 'It stays on record (watermarked VOID) and its number is never reused.', tone: 'danger', requireReason: true, confirmLabel: 'Void', onConfirm: async (reason) => { await api().documents.void(d.id, reason); state.reload(); }, success: 'Document voided' })}>Void</Button>
                  </div>
                </Card>
              )}

              {draft && canEdit ? (
                <DraftEditor d={d} gstAvailable={Boolean(profile.data?.gstAvailable)} onSaved={state.reload} />
              ) : (
                <>
                  <div className={s.grid2}>
                    <Card title={d.type === 'RECEIPT' ? 'Received from' : 'Client'}>
                      <DescriptionList
                        items={[
                          { label: 'Name', value: d.party?.name },
                          { label: 'Company', value: d.party?.company },
                          { label: 'Email', value: d.party?.email },
                          { label: 'Phone', value: d.party?.phone },
                          { label: 'Address', value: [d.party?.addressLine1, d.party?.addressLine2, d.party?.city, d.party?.state, d.party?.postalCode].filter(Boolean).join(', ') || null },
                          { label: 'GST state code', value: d.party?.stateCode },
                          { label: 'GSTIN', value: d.party?.gstin },
                        ]}
                      />
                    </Card>
                    <Card title="Totals">
                      <TotalsList totals={d.totals} paidPaise={d.type === 'INVOICE' ? d.amountPaidPaise : undefined} />
                      <div className={s.spacer} />
                      <DescriptionList
                        items={[
                          { label: 'Issued', value: d.issueDate ? formatDate(d.issueDate) : null },
                          { label: 'Valid until', value: d.validUntil ? formatDate(d.validUntil) : null },
                          { label: 'Due', value: d.dueDate ? formatDate(d.dueDate) : null },
                          { label: 'Sent', value: d.sentAt ? formatDateTime(d.sentAt) : null },
                          { label: 'Outcome', value: d.outcomeNote },
                          { label: 'Signed', value: d.signedAt ? `${formatDate(d.signedAt)} — ${d.signedNote}` : null },
                          { label: 'Payment', value: d.type === 'RECEIPT' ? [d.paymentMethod, d.paymentRef, d.paymentDate ? formatDate(d.paymentDate) : null].filter(Boolean).join(' · ') : null },
                        ]}
                      />
                    </Card>
                  </div>
                  {lines.length > 0 && (
                    <Card title="Line items">
                      <DataTable<Row>
                        caption="Line items"
                        rows={lines.map((l, i) => ({ ...l, i }))}
                        rowKey={(l) => String(l.i)}
                        columns={[
                          { key: 'd', header: 'Description', render: (l) => <span className={s.preWrap}>{l.description}{l.sac ? ` (SAC ${l.sac})` : ''}</span> },
                          { key: 'q', header: 'Qty', render: (l) => l.quantity },
                          { key: 'r', header: 'Rate', hideOnMobile: true, render: (l) => formatINR(l.unitPaise) },
                          { key: 'disc', header: 'Discount', hideOnMobile: true, render: (l) => (l.discountPaise ? formatINR(l.discountPaise) : '—') },
                          { key: 'g', header: 'GST', hideOnMobile: true, render: (l) => (d.totals?.gst ? `${l.taxRateBp / 100}%` : '—') },
                          { key: 'a', header: 'Amount', render: (l) => formatINR(l.taxablePaise) },
                        ]}
                      />
                    </Card>
                  )}
                  {((d.sections as Row[]) ?? []).length > 0 && (
                    <Card title="Sections">
                      <div className={s.stackSm}>
                        {(d.sections as Row[]).map((x, i) => (
                          <div key={i}>
                            <p className={s.strong}>{x.heading}</p>
                            <p className={s.preWrap}>{x.body}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </>
              )}

              <div className={s.grid2}>
                <Card title="Related records">
                  <DescriptionList
                    items={[
                      { label: 'Client', value: d.client ? <Link href={`/documents/clients/${d.client.id}`} className={s.link}>{d.client.company ?? d.client.name}</Link> : null },
                      { label: 'Lead', value: d.lead ? <Link href={`/leads/${d.lead.id}`} className={s.link}>{d.lead.reference ?? d.lead.name}</Link> : null },
                      { label: 'Student', value: d.student ? <Link href={`/students/${d.student.id}`} className={s.link}>{d.student.name}</Link> : null },
                      { label: 'Created from', value: d.source ? <Link href={`/documents/${d.source.id}`} className={s.link}>{DOC_TYPE_LABEL[d.source.type]} {d.source.number ?? 'draft'}</Link> : null },
                      { label: 'Revision of', value: d.revisionOf ? <Link href={`/documents/${d.revisionOf.id}`} className={s.link}>{d.revisionOf.number ?? 'draft'}</Link> : null },
                      { label: 'Later revisions', value: d.revisions?.length ? <span className={s.row}>{d.revisions.map((r: Row) => <Link key={r.id} href={`/documents/${r.id}`} className={s.link}>{r.number ?? `Rev. ${r.revision} draft`}</Link>)}</span> : null },
                      { label: 'Created next', value: others.length ? <span className={s.row}>{others.map((r) => <Link key={r.id} href={`/documents/${r.id}`} className={s.link}>{DOC_TYPE_LABEL[r.type]} {r.number ?? 'draft'}</Link>)}</span> : null },
                      { label: 'Template', value: d.template?.name },
                      { label: 'Created by', value: `${d.createdBy?.name ?? '—'} · ${formatDateTime(d.createdAt)}` },
                      { label: 'Signed copy', value: d.signedCopyFile ? <a className={s.link} href={api().documents.signedCopyUrl(d.id)} target="_blank" rel="noopener noreferrer">{d.signedCopyFile.originalName}</a> : null },
                    ]}
                  />
                </Card>
                {d.type === 'INVOICE' && (
                  <Card title="Payments received">
                    {receipts.length === 0 ? (
                      <p className={s.muted}>No payments recorded.</p>
                    ) : (
                      <ul className={s.list}>
                        {receipts.map((r) => (
                          <li key={r.id} className={s.listItem}>
                            <div className={s.rowBetween}>
                              <Link href={`/documents/${r.id}`} className={s.link}>{r.number}</Link>
                              <span className={s.row}>{formatINR(r.totalPaise)} <StatusBadge status={r.status} /></span>
                            </div>
                            <a className={s.small} href={api().documents.pdfUrl(r.id)} target="_blank" rel="noopener noreferrer">Receipt PDF</a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
              </div>
              <div className={s.grid2}>
                <Card title="Emails">
                  <EmailLogList emails={d.emails} />
                </Card>
                <Card title="History">
                  <AuditHistory entries={d.history} />
                </Card>
              </div>
            </div>
            <SendModal d={d} open={modal === 'send'} onClose={() => setModal(null)} onDone={state.reload} />
            <SignedModal d={d} open={modal === 'signed'} onClose={() => setModal(null)} onDone={state.reload} />
            <PaymentModal d={d} open={modal === 'payment'} onClose={() => setModal(null)} onDone={state.reload} />
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}
