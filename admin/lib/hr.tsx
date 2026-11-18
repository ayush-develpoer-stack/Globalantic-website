'use client';

import { api } from '@globalantic/api-client';
import { useAsync } from '@globalantic/ui';

type Row = Record<string, any>;

/** Active employees as <Select> options (value = user id). Loads up to 100 records. */
export function useEmployeeOptions() {
  const state = useAsync(() => api().hr.employees({ pageSize: 100 }), 'hr-employee-options');
  const options = (state.data?.items ?? [])
    .filter((e: Row) => e.user?.status === 'ACTIVE' && !e.exitDate)
    .map((e: Row) => ({ value: e.user.id as string, label: `${e.user.name} · ${e.employeeCode}` }));
  return { options, loading: state.loading, error: state.error, reload: state.reload };
}

export const UPLOAD_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Client-side hint only — the server detects the real type from the file's bytes. */
export function checkUpload(file: File | null): string | null {
  if (!file) return 'Choose a file';
  if (file.size === 0) return 'The file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is larger than 5 MB';
  if (file.type && !ALLOWED.includes(file.type)) return 'Only PDF, PNG, JPEG or WEBP files are allowed';
  return null;
}

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
