'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Textarea, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { useConfirm } from './admin';
import s from './admin.module.css';

type Row = Record<string, any>;

/**
 * Internal staff notes about a user (never shown to that user). Server access:
 * users.manage, training.students.manage or employees.manage.
 */
export function NotesPanel({ userId, title = 'Internal notes' }: { userId: string; title?: string }) {
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const state = useAsync(() => api().platform.notes(userId), `notes-${userId}`);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (body.trim().length < 2) {
      setFieldError('Write a note first');
      return;
    }
    setPending(true);
    setError(null);
    setFieldError(undefined);
    try {
      await api().platform.addNote(userId, body.trim());
      setBody('');
      toast('Note added');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setFieldError(fieldErrorMap(err).body);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title={title}>
      <div className={s.stackSm}>
        <p className={s.small}>Visible to staff only. Notes are never shown to the person they are about.</p>
        <form onSubmit={add} className={s.stackSm} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Textarea label="Add a note" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} error={fieldError} />
          <div className={s.actions}>
            <Button type="submit" size="sm" loading={pending}>Add note</Button>
          </div>
        </form>
        <AsyncView state={state} loadingRows={2} isEmpty={(d) => d.length === 0} empty={{ title: 'No notes yet' }}>
          {(notes: Row[]) => (
            <ul className={s.list} aria-label="Notes">
              {notes.map((n) => (
                <li key={n.id} className={s.listItem}>
                  <p className={s.preWrap}>{n.body}</p>
                  <div className={s.rowBetween}>
                    <span className={s.small}>{formatDateTime(n.createdAt)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        ask({
                          title: 'Delete this note?',
                          tone: 'danger',
                          confirmLabel: 'Delete',
                          onConfirm: async () => {
                            await api().platform.removeNote(userId, n.id);
                            state.reload();
                          },
                          success: 'Note deleted',
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncView>
      </div>
      {dialog}
    </Card>
  );
}
