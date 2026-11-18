'use client';

import { useState } from 'react';
import { Eye, SearchX, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/StateView';
import { humanizeStatus, StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useListParams } from '@/hooks/useListParams';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { errorMessage } from '@/lib/api/errors';
import { leadsService, type LeadKind, type LeadRecordMap, type StatusLeadKind } from '@/services/admin/leads.service';
import { PageHeader } from './AdminShell';
import { DataTable, type Column } from './DataTable';
import { ListToolbar } from './ListToolbar';
import { LEAD_CONFIGS } from './leadConfigs';
import styles from '@/app/admin/admin.module.css';

/**
 * One inbox screen (contacts / training / careers / newsletter): search,
 * status filter, sortable columns, pagination, details dialog, inline status
 * change and confirmed delete. Everything goes through leadsService.
 */
export function LeadsManager<K extends LeadKind>({ kind }: { kind: K }) {
  const config = LEAD_CONFIGS[kind];
  type Row = LeadRecordMap[K];

  const toast = useToast();
  const { query, setQuery, resetQuery, hasFilters } = useListParams();
  const { data, error, loading, reload, setData } = useServiceQuery(
    () => leadsService.list(kind, query),
    `${kind}:${JSON.stringify(query)}`,
  );

  const [viewing, setViewing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const rows = (data?.items ?? []) as Row[];

  async function changeStatus(row: Row, status: string) {
    if (!config.editableStatus || status === row.status) return;
    setStatusBusyId(row.id);
    try {
      const updated = (await leadsService.updateStatus(kind as StatusLeadKind, row.id, status)) as Row;
      // Confirmed by the service — update the row in place (no full reload).
      setData((current) =>
        current ? { ...current, items: current.items.map((r) => (r.id === row.id ? updated : r)) } : current,
      );
      setViewing((v) => (v && v.id === row.id ? updated : v));
      toast.success('Status updated', `${config.displayName(row)} is now “${humanizeStatus(status)}”.`);
    } catch (err) {
      toast.error('Could not update status', errorMessage(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await leadsService.remove(kind, deleting.id);
      toast.success(`${capitalize(config.singular)} deleted`, `${config.displayName(deleting)} was removed.`);
      setDeleting(null);
      setViewing(null);
      reload();
    } catch (err) {
      toast.error('Delete failed', errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function statusControl(row: Row) {
    if (!config.editableStatus) return <StatusBadge status={row.status} tone={config.tone(row.status as never)} />;
    return (
      <select
        className={styles.select}
        value={row.status}
        onChange={(e) => changeStatus(row, e.target.value)}
        disabled={statusBusyId === row.id}
        aria-label={`Status for ${config.displayName(row)}`}
      >
        {config.statuses.map((s) => (
          <option key={s} value={s}>
            {humanizeStatus(s)}
          </option>
        ))}
      </select>
    );
  }

  const columns: Column<Row>[] = [
    ...(config.columns as Column<Row>[]),
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => (config.editableStatus ? statusControl(r) : <StatusBadge status={r.status} tone={config.tone(r.status as never)} />),
    },
    {
      key: '__actions',
      label: 'Actions',
      hideLabel: true,
      align: 'end',
      render: (r) => (
        <div className={styles.rowActions}>
          <button type="button" className={styles.linkBtn} onClick={() => setViewing(r)}>
            <Eye size={14} aria-hidden /> View<span className="sr-only"> {config.displayName(r)}</span>
          </button>
          <button type="button" className={[styles.linkBtn, styles.dangerBtn].join(' ')} onClick={() => setDeleting(r)}>
            <Trash2 size={14} aria-hidden /> Delete<span className="sr-only"> {config.displayName(r)}</span>
          </button>
        </div>
      ),
    },
  ];

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={`No ${config.plural} match your filters`}
      description="Try a different search term or status."
      action={
        <Button variant="outline" size="sm" onClick={resetQuery}>
          Reset filters
        </Button>
      }
    />
  ) : (
    <EmptyState title={`No ${config.plural} yet`} description={`New ${config.plural} will appear here as they arrive.`} />
  );

  return (
    <>
      <PageHeader title={config.title} description={config.description} />

      <ListToolbar
        search={query.search ?? ''}
        onSearch={(search) => setQuery({ search })}
        searchPlaceholder={config.searchPlaceholder}
        status={query.status}
        statuses={config.statuses}
        onStatus={(status) => setQuery({ status })}
        hasFilters={hasFilters}
        onReset={resetQuery}
      />

      {error ? (
        <div className={styles.panel}>
          <ErrorState title={`Could not load ${config.plural}`} message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <DataTable<Row>
            caption={config.title}
            columns={columns}
            rows={rows}
            loading={loading}
            empty={empty}
            sort={query.sort ?? 'createdAt'}
            direction={query.direction ?? (query.sort ? 'asc' : 'desc')}
            onSortChange={(sort, direction) => setQuery({ sort, direction })}
          />
          {data && data.meta.total > 0 && (
            <Pagination
              meta={data.meta}
              itemLabel={config.plural}
              onPageChange={(page) => setQuery({ page })}
              onPageSizeChange={(pageSize) => setQuery({ pageSize })}
            />
          )}
        </>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? config.displayName(viewing) : ''}
        description={`${capitalize(config.singular)} details`}
        size="lg"
        footer={
          viewing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  // Close the details dialog first so dialogs never stack.
                  const row = viewing;
                  setViewing(null);
                  setDeleting(row);
                }}
              >
                <Trash2 size={15} aria-hidden /> Delete
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <>
            <div className={styles.detailStatus}>
              <StatusBadge status={viewing.status} tone={config.tone(viewing.status as never)} />
              {config.editableStatus && (
                <label className={styles.filterGroup}>
                  <span className={styles.filterLabel}>Change status</span>
                  {statusControl(viewing)}
                </label>
              )}
            </div>
            <dl className={styles.detailGrid}>
              {config.details.map((field) => (
                <div key={field.label} className={[styles.detailItem, field.wide ? styles.detailWide : ''].filter(Boolean).join(' ')}>
                  <dt className={styles.detailLabel}>{field.label}</dt>
                  <dd className={styles.detailValue}>{(field.value as (r: Row) => React.ReactNode)(viewing)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete this ${config.singular}?`}
        description={
          deleting
            ? `“${config.displayName(deleting)}” will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
