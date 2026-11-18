'use client';

import { useId, useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { TASK_STATUSES, enumLabel, type TaskStatus } from '@globalantic/types';
import { useToast } from '@globalantic/ui';
import s from '@/lib/page.module.css';

/** The only edit an employee can make to a task: its status (enforced by the API). */
export function TaskStatusSelect({ taskId, title, status, onChanged }: { taskId: string; title: string; status: TaskStatus; onChanged: () => void }) {
  const toast = useToast();
  const id = useId();
  const [value, setValue] = useState<TaskStatus>(status);
  const [pending, setPending] = useState(false);

  const change = async (next: TaskStatus) => {
    if (pending || next === value) return;
    const previous = value;
    setValue(next);
    setPending(true);
    try {
      await api().employee.setTaskStatus(taskId, next);
      toast(`Task marked ${enumLabel(next).toLowerCase()}.`, 'success');
      onChanged();
    } catch (err) {
      setValue(previous);
      toast(errorMessage(err), 'danger');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <label htmlFor={id} className="sr-only">
        Status of {title}
      </label>
      <select id={id} className={s.statusSelect} value={value} disabled={pending} onChange={(e) => void change(e.target.value as TaskStatus)}>
        {TASK_STATUSES.map((st) => (
          <option key={st} value={st}>
            {enumLabel(st)}
          </option>
        ))}
      </select>
    </>
  );
}
