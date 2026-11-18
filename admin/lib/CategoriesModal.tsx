'use client';

import { useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, Button, Input, Modal, useAsync } from '@globalantic/ui';
import { useConfirm, useRun } from './admin';
import { slugify } from './cms';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Blog categories: add, rename, delete (posts keep existing; their category is cleared). */
export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAsync(() => api().cms.categories(), `cats-${open}`);
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = async () => {
    setError(null);
    try {
      await api().cms.createCategory({ name: name.trim(), slug: slugify(name) });
      setName('');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Blog categories" footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <div className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className={s.row}>
          <Input label="New category" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" onClick={add} disabled={name.trim().length < 2}>Add</Button>
        </div>
        <ul className={s.list}>
          {(state.data ?? []).map((c: Row) => (
            <li key={c.id} className={s.listItem}>
              {editing && editing.id === c.id ? (
                <div className={s.row}>
                  <Input label="Name" value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                  <Button size="sm" onClick={async () => { if (await run(() => api().cms.updateCategory(c.id, { name: editing.name.trim(), slug: c.slug }), 'Saved')) { setEditing(null); state.reload(); } }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              ) : (
                <div className={s.rowBetween}>
                  <span>{c.name} <span className={s.small}>/{c.slug} · {c._count?.posts ?? 0} posts</span></span>
                  <span className={s.actions}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</Button>
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: `Delete “${c.name}”?`, message: 'Posts in this category stay published without a category.', confirmLabel: 'Delete', tone: 'danger', onConfirm: async () => { await api().cms.deleteCategory(c.id); state.reload(); }, success: 'Category deleted' })}>Delete</Button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {dialog}
      </div>
    </Modal>
  );
}
