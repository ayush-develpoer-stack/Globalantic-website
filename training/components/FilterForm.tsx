'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Select, type Option } from '@globalantic/ui';
import s from '@/styles/site.module.css';

export interface FilterDef {
  name: string;
  label: string;
  options: Option[];
}

/**
 * GET-style filter bar: writes the values to the URL so filtered pages are
 * shareable and server-rendered. Page resets to 1 on every change.
 */
export function FilterForm({ basePath, values, filters, searchLabel }: { basePath: string; values: Record<string, string>; filters: FilterDef[]; searchLabel?: string }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, string>>(values);

  const apply = (next: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const q = qs.toString();
    router.push(q ? `${basePath}?${q}` : basePath);
  };

  return (
    <form
      className={s.filters}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply(state);
      }}
    >
      {searchLabel && (
        <Input label={searchLabel} type="search" name="search" value={state.search ?? ''} onChange={(e) => setState({ ...state, search: e.target.value })} placeholder="e.g. web development" maxLength={100} />
      )}
      {filters.map((f) => (
        <Select
          key={f.name}
          label={f.label}
          name={f.name}
          value={state[f.name] ?? ''}
          options={f.options}
          placeholder="All"
          onChange={(e) => {
            const next = { ...state, [f.name]: e.target.value };
            setState(next);
            apply(next);
          }}
        />
      ))}
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
