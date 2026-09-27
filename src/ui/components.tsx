import type { ReactNode } from 'react';

/** Small shared form controls used across the Configure pages. */

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      <header className="card-head">
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{format ? format(value) : value}</output>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function OptionCards<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; title: string; desc: string; disabled?: boolean; badge?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="option-cards">
      {options.map((o) => (
        <button key={o.value} className={`option${o.value === value ? ' on' : ''}`} disabled={o.disabled} onClick={() => onChange(o.value)}>
          <span className="option-title">
            {o.title}
            {o.badge && <em>{o.badge}</em>}
          </span>
          <span className="option-desc">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        −
      </button>
      <output>
        {value}
        {suffix}
      </output>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function Swatches({ value, colors, onChange, allowAuto, autoLabel }: { value: number | null; colors: number[]; onChange: (v: number | null) => void; allowAuto?: boolean; autoLabel?: string }) {
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  return (
    <div className="swatches">
      {allowAuto && (
        <button className={`swatch auto${value === null ? ' on' : ''}`} onClick={() => onChange(null)} title={autoLabel}>
          {autoLabel ?? 'Auto'}
        </button>
      )}
      {colors.map((c) => (
        <button key={c} className={`swatch${value === c ? ' on' : ''}`} style={{ background: hex(c) }} onClick={() => onChange(c)} aria-label={hex(c)} />
      ))}
    </div>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>
        {value}
        {unit && <span>{unit}</span>}
      </b>
    </div>
  );
}
