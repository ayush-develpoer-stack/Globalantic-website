'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Badge, Card, DataTable, PageHeader, useAsync } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

export default function RolesPage() {
  const state = useAsync(() => api().platform.roles(), 'roles-matrix-page');
  const catalog = useAsync(() => api().platform.permissions(), 'permission-catalog-page');
  return (
    <>
      <PageHeader
        eyebrow={<Link className={s.link} href="/users">← Users & roles</Link>}
        title="Permission matrix"
        description="What each role can do, plus the full permission catalogue. The server enforces these permissions on every request."
      />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No roles defined' }}>
        {(rows) => (
          <div className={s.grid2}>
            {rows.map((r) => (
              <Card key={r.role} title={enumLabel(r.role)} actions={<Badge tone={r.assignable ? 'primary' : 'neutral'}>{r.assignable ? 'Assignable here' : 'Not assignable here'}</Badge>}>
                {r.permissions.length ? (
                  <ul className={s.tags} aria-label={`${enumLabel(r.role)} permissions`}>
                    {r.permissions.map((p) => (
                      <li key={p}><Badge>{p}</Badge></li>
                    ))}
                  </ul>
                ) : (
                  <p className={s.muted}>No permissions.</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </AsyncView>
      <div className={s.spacer} />
      <Card title="Permission catalogue">
        <p className={s.muted}>Every permission the server knows, which roles include it, and whether an administrator can grant it to an individual Editor, Finance or HR account (from the user’s detail page).</p>
        <div className={s.spacer} />
        <AsyncView state={catalog} isEmpty={(d) => d.length === 0} empty={{ title: 'No permissions defined' }}>
          {(rows) => (
            <DataTable
              caption="Permission catalogue"
              rows={rows}
              rowKey={(r) => r.permission}
              columns={[
                { key: 'p', header: 'Permission', render: (r) => <span className={s.mono}>{r.permission}</span> },
                { key: 'r', header: 'Roles', render: (r) => (r.roles.length ? r.roles.map((x) => enumLabel(x)).join(', ') : '—') },
                { key: 'g', header: 'Grantable', render: (r) => <Badge tone={r.grantable ? 'success' : 'neutral'}>{r.grantable ? 'Yes' : 'No'}</Badge> },
                { key: 'why', header: 'Note', hideOnMobile: true, render: (r) => <span className={s.small}>{r.reason ?? '—'}</span> },
              ]}
            />
          )}
        </AsyncView>
      </Card>
    </>
  );
}
