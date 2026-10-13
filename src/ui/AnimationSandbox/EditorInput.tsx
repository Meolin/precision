import { useRef, useState } from 'react';

export interface NumericKeyframeControl {
  active: boolean;
  animated: boolean;
  onInsert: (value: number) => void;
}

export function InspectorKeyframeButton({
  label,
  active,
  animated,
  disabled,
  onInsert,
}: {
  label: string;
  active: boolean;
  animated: boolean;
  disabled?: boolean;
  onInsert: () => void;
}) {
  return (
    <button
      type="button"
      className={`inspector-keyframe-button${animated ? ' animated' : ''}`}
      aria-label={`Ключевой кадр: ${label}`}
      aria-pressed={active}
      title={`${active ? 'Обновить' : 'Добавить'} ключ на текущем времени · ${label}`}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onInsert}
    >
      {active ? '◆' : '◇'}
    </button>
  );
}

export function NumericInput({
  value,
  onCommit,
  onFocus,
  min,
  max,
  step,
  disabled,
  label,
  keyframe,
}: {
  value: number;
  onCommit: (value: number) => void;
  onFocus?: () => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: string;
  keyframe?: NumericKeyframeControl;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const draftRef = useRef(String(value));
  const committedValue = useRef(value);
  const bounded = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
  const currentValue = () => {
    const next = Number(draftRef.current);
    return editing && draftRef.current.trim() && Number.isFinite(next) ? next : value;
  };
  const commit = (next: number, insertKey = false) => {
    next = bounded(next);
    draftRef.current = String(next);
    setDraft(String(next));
    cancelled.current = false;
    if (insertKey) keyframe?.onInsert(next);
    else if (next !== (editing ? committedValue.current : value)) onCommit(next);
    committedValue.current = next;
  };
  const increment = (direction: number, fast = false) => {
    const next = currentValue() + direction * (step ?? 1) * (fast ? 10 : 1);
    // Avoid accumulating binary rounding errors on repeated fractional steps.
    commit(Number(next.toFixed(10)));
  };
  return (
    <span className="editor-numeric-input">
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
          draftRef.current = String(value);
          committedValue.current = value;
          setEditing(true);
          onFocus?.();
        }}
        onChange={(event) => {
          const text = event.target.value;
          draftRef.current = text;
          setDraft(text);
          // Native steppers can dispatch input without first focusing the field.
          if (!editing && text.trim() && Number.isFinite(Number(text))) commit(Number(text));
        }}
        onBlur={() => {
          setEditing(false);
          const next = Number(draftRef.current);
          if (cancelled.current || !draftRef.current.trim() || !Number.isFinite(next)) return;
          if (bounded(next) !== committedValue.current) commit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            cancelled.current = true;
            event.currentTarget.blur();
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            increment(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
          }
        }}
      />
      <span className="editor-number-steppers">
        {([1, -1] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={`${direction === 1 ? 'Увеличить' : 'Уменьшить'} ${label ?? 'значение'}`}
            title="Shift · шаг ×10"
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => increment(direction, event.shiftKey)}
          >
            {direction === 1 ? '▴' : '▾'}
          </button>
        ))}
      </span>
      {keyframe ? (
        <InspectorKeyframeButton
          label={label ?? 'значение'}
          active={keyframe.active}
          animated={keyframe.animated}
          disabled={disabled}
          onInsert={() => commit(currentValue(), true)}
        />
      ) : null}
    </span>
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
