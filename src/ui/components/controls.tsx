import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../icons';
import { useBack, useTabSwitch } from '../nav';
import { KeyHint } from './KeyHint';

/** Form controls. All support mouse, keyboard (arrows / Enter / Space) and gamepad (via synthetic arrows). */

export interface SegOption<T> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Alliance tone for the selected state (alliance pickers only). */
  tone?: 'red' | 'blue';
}

/** Moves through enabled options with the arrow keys; returns the new value or null. */
function arrowStep<T>(e: KeyboardEvent, options: { value: T; disabled?: boolean }[], value: T, axis: 'x' | 'y' | 'both' = 'x'): T | null {
  const fwd = e.key === 'ArrowRight' || (axis !== 'x' && e.key === 'ArrowDown');
  const back = e.key === 'ArrowLeft' || (axis !== 'x' && e.key === 'ArrowUp');
  if (!fwd && !back) return null;
  const enabled = options.filter((o) => !o.disabled);
  const i = enabled.findIndex((o) => o.value === value);
  const next = enabled[i + (fwd ? 1 : -1)];
  return next ? next.value : null;
}

export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  block,
  label,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hasSelected = options.some((o) => o.value === value && !o.disabled);
  return (
    <div
      ref={ref}
      className={`zd-seg${size === 'sm' ? ' zd-seg--sm' : ''}${block ? ' zd-seg--block' : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        const next = arrowStep(e, options, value);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
        const i = options.findIndex((o) => o.value === next);
        (ref.current?.children[i] as HTMLElement | undefined)?.focus();
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!hasSelected && i === 0) ? 0 : -1}
            className={o.tone ? `zd-tone-${o.tone}` : undefined}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tabs. With `global`, LB/RB (and [ / ]) switch tabs from anywhere on the screen. */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  global,
  label,
}: {
  value: T;
  tabs: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  global?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cycle = (dir: 1 | -1) => {
    const en = tabs.filter((t) => !t.disabled);
    const i = en.findIndex((t) => t.value === value);
    const next = en[(i + dir + en.length) % en.length];
    if (next) onChange(next.value);
  };
  useTabSwitch(cycle, !!global);
  return (
    <div
      ref={ref}
      className="zd-tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        const next = arrowStep(e, tabs, value);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
        const i = tabs.findIndex((t) => t.value === next);
        (ref.current?.querySelectorAll('[role="tab"]')[i] as HTMLElement | undefined)?.focus();
      }}
    >
      {global && (
        <span className="zd-tabs-hint" aria-hidden="true">
          <KeyHint action="tabPrev" />
        </span>
      )}
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} disabled={t.disabled} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
      {global && (
        <span className="zd-tabs-hint" aria-hidden="true">
          <KeyHint action="tabNext" />
        </span>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={checked} aria-label={label} className="zd-toggle" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="zd-toggle-track">
        <span className="zd-toggle-knob" />
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`zd-check${disabled ? ' zd-check--disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="zd-check-box">
        <Icon name="check" />
      </span>
      {children}
    </label>
  );
}

export function RadioGroup<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  const name = useId();
  return (
    <div className="zd-radio-group" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={`zd-check zd-check--radio${o.disabled ? ' zd-check--disabled' : ''}`}>
          <input type="radio" name={name} checked={o.value === value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          <span className="zd-check-box">
            <span className="zd-check-dot" />
          </span>
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`zd-input${props.className ? ` ${props.className}` : ''}`} />;
}

const decimalsOf = (n: number): number => {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

/**
 * Slider with a numeric input and unit. `scale` converts the stored value to the displayed number
 * (e.g. 0.35 × 100 = "35 %"). Arrow keys (and the gamepad D-pad) step it; Shift steps ×10.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  unit,
  scale = 1,
  label,
  disabled,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
  scale?: number;
  label: string;
  disabled?: boolean;
  /** Text shown instead of the numeric input (read-only display, e.g. feet and inches). */
  format?: (v: number) => string;
}) {
  const dec = Math.max(0, decimalsOf(step * scale));
  const [text, setText] = useState((value * scale).toFixed(dec));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText((value * scale).toFixed(dec));
  }, [value, scale, dec]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const commit = () => {
    editing.current = false;
    const n = parseFloat(text);
    if (Number.isFinite(n)) onChange(clamp(n / scale));
    else setText((value * scale).toFixed(dec));
  };
  const pct = ((value - min) / (max - min)) * 100;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    // Up/Down leave the slider for gamepad navigation (synthetic events); real keys still step.
    if (!d || (!e.nativeEvent.isTrusted && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) return;
    e.preventDefault();
    onChange(clamp(value + d * step * (e.shiftKey ? 10 : 1)));
  };
  return (
    <div className="zd-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={format ? format(value) : `${(value * scale).toFixed(dec)}${unit ? ` ${unit}` : ''}`}
        style={{ ['--pct' as string]: `${pct}%` }}
        onKeyDown={onKey}
        onChange={(e) => onChange(+e.target.value)}
      />
      {format ? (
        <span className="zd-slider-num zd-num" aria-hidden="true">
          <span style={{ padding: '0 var(--space-2)' }}>{format(value)}</span>
        </span>
      ) : (
        <label className="zd-slider-num">
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label}${unit ? ` (${unit})` : ''}`}
            value={text}
            min={min * scale}
            max={max * scale}
            step={step * scale}
            disabled={disabled}
            onFocus={() => (editing.current = true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          {unit && <span className="zd-slider-unit">{unit}</span>}
        </label>
      )}
    </div>
  );
}

export interface SelectOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Dropdown with type-ahead search (type letters to jump), arrows, Enter, Esc. */
export function Select<T extends string | number>({ value, options, onChange, label, block, disabled }: { value: T; options: SelectOption<T>[]; onChange: (v: T) => void; label: string; block?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef({ text: '', at: 0 });
  const id = useId();
  const cur = options.find((o) => o.value === value);

  const focusOption = (i: number) => {
    setActive(i);
    (list.current?.querySelectorAll('[role="option"]')[i] as HTMLElement | undefined)?.focus();
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  useBack(() => close(), open);
  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    requestAnimationFrame(() => focusOption(i));
    const onDoc = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typeahead = (key: string) => {
    const now = performance.now();
    const s = search.current;
    s.text = now - s.at > 600 ? key.toLowerCase() : s.text + key.toLowerCase();
    s.at = now;
    const start = open ? active + (s.text.length === 1 ? 1 : 0) : 0;
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (!options[i].disabled && options[i].label.toLowerCase().startsWith(s.text)) return i;
    }
    return -1;
  };

  return (
    <div ref={root} className={`zd-select${block ? ' zd-select--block' : ''}`}>
      <button
        ref={trigger}
        type="button"
        className="zd-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${cur?.label ?? ''}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && e.nativeEvent.isTrusted) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key.length === 1 && /\S/.test(e.key)) {
            const i = typeahead(e.key);
            if (i >= 0) onChange(options[i].value);
          }
        }}
      >
        <span>{cur?.label ?? '—'}</span>
        <Icon name="chevronDown" size="var(--icon-sm)" />
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="zd-select-list"
          data-nav-scope="float"
          onKeyDown={(e) => {
            const en = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
            const pos = en.indexOf(active);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = en[Math.min(en.length - 1, Math.max(0, pos + (e.key === 'ArrowDown' ? 1 : -1)))];
              if (next !== undefined) focusOption(next);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              focusOption(e.key === 'Home' ? en[0] : en[en.length - 1]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'Tab') {
              close(false);
            } else if (e.key.length === 1 && /\S/.test(e.key)) {
              const i = typeahead(e.key);
              if (i >= 0) focusOption(i);
            }
          }}
        >
          {options.map((o, i) => (
            <li key={String(o.value)}>
              <button
                type="button"
                role="option"
                tabIndex={-1}
                data-nav-item
                aria-selected={o.value === value}
                data-active={i === active}
                disabled={o.disabled}
                className="zd-select-option"
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                {o.label}
                {o.value === value && <Icon name="check" size="var(--icon-sm)" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
