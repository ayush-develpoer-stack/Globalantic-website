'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap, isApiError } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Alert, Button, Card, DataTable, EmptyState, Input, LoadingState, Select, formatDate, formatDateTime, formatINR, useToast } from '@globalantic/ui';
import { downloadCsv } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;
type ReportType = 'admissions' | 'payments' | 'attendance' | 'courses' | 'batches' | 'referrals' | 'students' | 'employees';

const TYPES: { value: ReportType; label: string; dateNote: string }[] = [
  { value: 'admissions', label: 'Admissions', dateNote: 'Filters by submission date' },
  { value: 'payments', label: 'Payments', dateNote: 'Filters by payment creation date' },
  { value: 'attendance', label: 'Attendance by batch', dateNote: 'Filters by class date' },
  { value: 'courses', label: 'Courses', dateNote: 'Filters applications counted per course' },
  { value: 'batches', label: 'Batches', dateNote: 'Filters by batch start date' },
  { value: 'referrals', label: 'Referral rewards', dateNote: 'Filters by reward creation date' },
  { value: 'students', label: 'Students', dateNote: 'Filters by registration date' },
  { value: 'employees', label: 'Employees', dateNote: 'Filters by joining date' },
];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function display(key: string, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key.endsWith('Paise') && typeof v === 'number') return formatINR(v);
  if (key === 'attendancePercent' && typeof v === 'number') return `${v}%`;
  if (typeof v === 'string' && ISO.test(v)) return /T00:00:00(\.000)?Z$/.test(v) ? formatDate(v) : formatDateTime(v);
  if (typeof v === 'string' && /^[A-Z_]+$/.test(v) && v.length > 2) return enumLabel(v);
  return String(v);
}

/** CSV values: rupees for *Paise columns, raw strings otherwise (downloadCsv neutralises formulas). */
function toCsvRows(rows: Row[]): Row[] {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => (k.endsWith('Paise') && typeof v === 'number' ? [k.replace(/Paise$/, ' (INR)'), v / 100] : [k, v ?? ''])),
    ),
  );
}

const header = (k: string) => k.replace(/Paise$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * Typed report with server-side date filters (GET /api/platform/reports/:type).
 * Exporting re-runs the report with export=true so the server records an audited
 * "report.exported" event before the CSV is created in the browser.
 */
export function TypedReport() {
  const toast = useToast();
  const [type, setType] = useState<ReportType>('admissions');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<{ rows: Row[]; truncated: boolean; limit: number; type: string; from: string | null; to: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const validate = () => {
    const f: Record<string, string> = {};
    if (from && to && from > to) f.to = 'The end date must be on or after the start date';
    setFields(f);
    return Object.keys(f).length === 0;
  };

  const handleError = (err: unknown) => {
    if (isApiError(err) && err.status === 403) setError('You do not have permission to run this report. Ask an administrator if you need it.');
    else setError(errorMessage(err));
    setFields(fieldErrorMap(err));
  };

  const run = async () => {
    if (loading || !validate()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api().platform.report(type, { from: from || undefined, to: to || undefined }));
    } catch (err) {
      setResult(null);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (exporting || !validate()) return;
    setExporting(true);
    setError(null);
    try {
      const r = await api().platform.report(type, { from: from || undefined, to: to || undefined, export: true });
      setResult(r);
      if (!r.rows.length) {
        toast('Nothing to export for this range', 'info');
        return;
      }
      downloadCsv(`${type}-report${from ? `-from-${from}` : ''}${to ? `-to-${to}` : ''}.csv`, toCsvRows(r.rows));
      toast('Report exported (recorded in the audit log)');
    } catch (err) {
      handleError(err);
    } finally {
      setExporting(false);
    }
  };

  const columns = result?.rows.length ? Object.keys(result.rows[0]) : [];
  const note = TYPES.find((t) => t.value === type)?.dateNote;

  return (
    <Card title="Detailed reports">
      <div className={s.stackSm}>
        <p className={s.muted}>Choose a report and an optional date range. Filtering happens on the server; at most {result?.limit ?? 2000} rows are returned. Exports are recorded in the audit log.</p>
        <div className={s.formGrid}>
          <Select label="Report" value={type} onChange={(e) => { setType(e.target.value as ReportType); setResult(null); setError(null); }} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} hint={note} />
          <div className={s.formGrid}>
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={fields.from} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={fields.to} />
          </div>
        </div>
        <div className={s.actions}>
          <Button onClick={run} loading={loading}>Run report</Button>
          <Button variant="outline" onClick={exportCsv} loading={exporting} disabled={loading}>Export CSV</Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {loading && !result && <LoadingState rows={3} />}
        {result && (
          <>
            {result.truncated && <Alert tone="warning" title="Result truncated">Only the first {result.limit} rows are shown. Narrow the date range to see everything.</Alert>}
            {result.rows.length === 0 ? (
              <EmptyState title="No rows for this report" description="Try a wider date range." />
            ) : (
              <>
                <p className={s.small}>{result.rows.length} row{result.rows.length === 1 ? '' : 's'}</p>
                <DataTable<Row>
                  caption={`${type} report`}
                  rows={result.rows}
                  rowKey={(r) => JSON.stringify(r)}
                  columns={columns.map((k) => ({ key: k, header: header(k), render: (r: Row) => display(k, r[k]) }))}
                />
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
