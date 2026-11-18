'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Button, DataTable, Input, Pagination, StatusBadge, Toolbar, formatDate, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

/** All referral codes with owner, clicks and registrations (referrals.read); enable/disable needs referrals.settings. */
export function CodesPanel() {
  const { can } = useSession();
  const { ask, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const state = useAsync(() => api().admin.referralCodes({ search: q, page, pageSize: 25 }), `referral-codes|${q}|${page}`);
  const manage = can('referrals.settings');

  return (
    <>
      <Toolbar>
        <Input label="Search" placeholder="Code, name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No referral codes yet', description: 'Codes are generated for eligible students when they open their referral dashboard.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Referral codes"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'c', header: 'Code', render: (r) => <span className={s.mono}>{r.code}</span> },
                {
                  key: 'o',
                  header: 'Owner',
                  render: (r) => (
                    <>
                      {can('training.students.read') ? <Link className={s.link} href={`/students/${r.user.id}`}>{r.user.name}</Link> : <span className={s.strong}>{r.user.name}</span>}
                      <div className={s.small}>{r.user.email}</div>
                    </>
                  ),
                },
                { key: 'k', header: 'Clicks', render: (r) => r._count.clicks },
                { key: 'g', header: 'Registrations', render: (r) => r._count.registrations },
                { key: 'd', header: 'Created', hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) =>
                    manage ? (
                      <Button
                        size="sm"
                        variant={r.status === 'ACTIVE' ? 'ghost' : 'outline'}
                        onClick={() => {
                          const next = r.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                          ask({
                            title: next === 'DISABLED' ? `Disable code ${r.code}?` : `Re-enable code ${r.code}?`,
                            message: next === 'DISABLED' ? 'New clicks and registrations with this code will be ignored. Existing rewards are not changed.' : undefined,
                            tone: next === 'DISABLED' ? 'danger' : 'primary',
                            confirmLabel: next === 'DISABLED' ? 'Disable' : 'Enable',
                            requireReason: true,
                            onConfirm: async (reason) => {
                              await api().admin.setReferralCodeStatus(r.id, next, reason);
                              state.reload();
                            },
                            success: 'Referral code updated',
                          });
                        }}
                      >
                        {r.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </Button>
                    ) : null,
                },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {dialog}
    </>
  );
}
