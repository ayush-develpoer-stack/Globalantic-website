'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Modal, Textarea } from '@globalantic/ui';
import { PartyFields, emptyParty, partyFromRow, partyToApi, type PartyForm } from './docs';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Create / edit a business client (used by the clients list and client detail pages). */
export function ClientModal({ client, open, onClose, onSaved }: { client: Row | null; open: boolean; onClose: () => void; onSaved: (c: Row) => void }) {
  const [v, setV] = useState<PartyForm>(emptyParty);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!open) return;
    setV(client ? partyFromRow(client) : emptyParty);
    setNotes(client?.notes ?? '');
    setErrors({});
    setError(null);
  }, [open, client]);
  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const body = { ...partyToApi(v), notes: notes.trim() || null };
      const c = client ? await api().documents.updateClient(client.id, { ...body, leadId: client.leadId ?? null }) : await api().documents.createClient(body);
      onSaved(c);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={client ? 'Edit client' : 'New client'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save client</Button></>}>
      <div className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <PartyFields value={v} onChange={setV} errors={errors} />
        <Textarea label="Notes (internal)" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
