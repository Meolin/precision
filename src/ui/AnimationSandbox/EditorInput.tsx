import { useRef, useState } from 'react';

export function NumericInput({
  value,
  onCommit,
  onFocus,
  min,
  max,
  step,
  disabled,
  label,
}: {
  value: number;
  onCommit: (value: number) => void;
  onFocus?: () => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={editing ? draft : String(value)}
      onFocus={() => {
        cancelled.current = false;
        setDraft(String(value));
        setEditing(true);
        onFocus?.();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = Number(draft);
        if (cancelled.current || !draft.trim() || !Number.isFinite(next)) return;
        const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
        if (bounded !== value) onCommit(bounded);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function TextInput({
  value,
  onCommit,
  label,
  disabled,
  type = 'text',
}: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  disabled?: boolean;
  type?: 'text' | 'color';
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  return (
    <input
      type={type}
      aria-label={label}
      disabled={disabled}
      value={editing ? draft : value}
      onFocus={() => {
        cancelled.current = false;
        setDraft(value);
        setEditing(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        if (!cancelled.current && draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
