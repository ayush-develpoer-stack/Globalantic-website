'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Card, Input, LoadingState, PageHeader, Select, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { DocumentFields, docToApi, emptyDoc, type DocForm } from '@/lib/DocumentEditor';
import { DOC_TYPE_LABEL, PartyFields, emptyParty, linesFromApi, partyToApi, type PartyForm } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function NewDocumentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const allowed = Object.keys(DOC_TYPE_LABEL).filter((t) => t !== 'RECEIPT' && (t === 'INVOICE' ? can('documents.finance') : can('documents.manage')));
  const [type, setType] = useState(() => {
    const t = params.get('type') ?? '';
    return allowed.includes(t) ? t : (allowed[0] ?? '');
  });
  const leadId = params.get('leadId');
  const studentId = params.get('studentId');
  const [clientId, setClientId] = useState(params.get('clientId') ?? '');
  const [manual, setManual] = useState(false);
  const [party, setParty] = useState<PartyForm>(emptyParty);
  const [clientSearch, setClientSearch] = useState('');
  const q = useDebounced(clientSearch);
  const [templateId, setTemplateId] = useState('');
  const [v, setV] = useState<DocForm>(emptyDoc);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leadNote, setLeadNote] = useState<string | null>(null);

  const profile = useAsync(() => api().documents.profile(), 'doc-profile');
  const clients = useAsync(() => api().documents.clients({ search: q, pageSize: 50 }), `doc-clients-${q}`);
  const templates = useAsync(() => (type ? api().documents.templates({ type }) : Promise.resolve([])), `doc-templates-${type}`);

  // Lead -> client (the server re-uses the client already linked to the lead).
  useEffect(() => {
    if (!leadId) return;
    api()
      .documents.clientFromLead(leadId)
      .then((c) => {
        setClientId(c.id);
        setLeadNote(`Client ${c.company ?? c.name} from the lead. Check the address and GST state code before issuing.`);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [leadId]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = (templates.data ?? []).find((x: Row) => x.id === id);
    if (!t) return;
    setV((cur) => ({
      ...cur,
      title: cur.title || t.title || '',
      lines: cur.lines.length ? cur.lines : linesFromApi(t.items),
      sections: cur.sections.length ? cur.sections : ((t.sections as Row[]) ?? []).map((x) => ({ heading: x.heading, body: x.body })),
      notes: cur.notes || t.notes || '',
      terms: cur.terms || t.terms || '',
    }));
  };

  if (!allowed.length) return <Alert tone="warning">You do not have permission to create documents.</Alert>;

  const create = async () => {
    const r = docToApi(type, v);
    if ('error' in r) return setError(r.error);
    if (!studentId && !clientId && !manual) return setError('Choose a client, or enter the details manually.');
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const d = await api().documents.create({
        type,
        ...r.body,
        ...(templateId ? { templateId } : {}),
        ...(leadId ? { leadId } : {}),
        ...(studentId ? { studentId } : {}),
        ...(clientId && !manual ? { clientId } : {}),
        ...(manual ? { party: partyToApi(party) } : {}),
      });
      router.push(`/documents/${d.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  const clientOptions = (clients.data?.items ?? []).map((c: Row) => ({ value: c.id, label: `${c.company ? `${c.company} — ` : ''}${c.name} (${c.email})` }));

  return (
    <>
      <PageHeader eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>} title="New document" description="Creates an editable draft. Nothing is numbered or sent until you issue it." />
      <div className={s.stack}>
        {error && <Alert tone="danger">{error}</Alert>}
        {profile.data && profile.data.gaps?.length > 0 && (
          <Alert tone="warning" title="Company details are incomplete">
            Documents will leave out: {profile.data.gaps.join(', ')}. <Link href="/documents/settings" className={s.link}>Company details</Link>
          </Alert>
        )}
        <Card title="Type and client">
          <div className={s.formGrid}>
            <Select label="Document type" value={type} onChange={(e) => { setType(e.target.value); setTemplateId(''); }} options={allowed.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} />
            <Select label="Template (optional)" value={templateId} onChange={(e) => applyTemplate(e.target.value)} placeholder="No template" options={(templates.data ?? []).map((t: Row) => ({ value: t.id, label: t.name }))} />
            {studentId ? (
              <div className={s.span2}><Alert tone="info">The bill-to details come from the student record.</Alert></div>
            ) : (
              <>
                {leadNote && <div className={s.span2}><Alert tone="info">{leadNote}</Alert></div>}
                {!manual && (
                  <>
                    <Input label="Find client" placeholder="Name, company or email" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
                    <Select label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Choose a client" options={clientId && !clientOptions.some((o: Row) => o.value === clientId) ? [{ value: clientId, label: 'Selected client' }, ...clientOptions] : clientOptions} error={errors.clientId} />
                  </>
                )}
                <div className={s.span2}>
                  <div className={s.actions}>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setManual(!manual)}>
                      {manual ? 'Choose a saved client instead' : 'Enter the client details manually'}
                    </Button>
                    <Link href="/documents/clients" className={s.link}>Manage clients</Link>
                  </div>
                </div>
              </>
            )}
          </div>
          {manual && !studentId && (
            <>
              <div className={s.spacer} />
              <PartyFields value={party} onChange={setParty} errors={errors} prefix="party." />
            </>
          )}
        </Card>
        {type && <DocumentFields type={type} value={v} onChange={setV} errors={errors} gstAvailable={Boolean(profile.data?.gstAvailable)} />}
        <div className={s.actions}>
          <Button onClick={create} loading={pending}>Create draft</Button>
          <Link href="/documents" className={s.link}>Cancel</Link>
        </div>
      </div>
    </>
  );
}

export default function NewDocumentPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewDocumentInner />
    </Suspense>
  );
}
