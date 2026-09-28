import { useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { navigate } from '../router';
import { useTween } from './tween';

/** Surfaces and read-only display components. */

export function Spinner({ immediate, label = 'Loading' }: { immediate?: boolean; label?: string }) {
  return <span className={`zd-spinner${immediate ? ' zd-spinner--now' : ''}`} role="status" aria-label={label} />;
}

export function ProgressBar({ value, thick, label }: { value: number | null; thick?: boolean; label?: string }) {
  const v = value === null ? null : Math.max(0, Math.min(1, value));
  return (
    <div
      className={`zd-progress${thick ? ' zd-progress--thick' : ''}${v === null ? ' zd-progress--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v === null ? undefined : Math.round(v * 100)}
    >
      <span style={v === null ? undefined : { transform: `scaleX(${v})` }} />
    </div>
  );
}

export function Skeleton({ width = '100%', height = 'var(--space-4)', radius, style }: { width?: string; height?: string; radius?: string; style?: CSSProperties }) {
  return <span className="zd-skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

type CardBase = { children: ReactNode; className?: string; compact?: boolean; selected?: boolean };

/** Card: static (div), a button (onClick) or an in-app link (to). */
export function Card({
  children,
  className,
  compact,
  selected,
  onClick,
  to,
  disabled,
  ...rest
}: CardBase & { onClick?: () => void; to?: string; disabled?: boolean } & Omit<HTMLAttributes<HTMLElement>, 'onClick'>) {
  const c = ['zd-card', compact ? 'zd-card--compact' : '', onClick || to ? 'zd-card--interactive' : '', selected ? 'zd-card--selected' : '', className ?? ''].filter(Boolean).join(' ');
  if (to)
    return (
      <a
        href={to}
        className={c}
        aria-disabled={disabled || undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          if (!disabled) navigate(to);
        }}
        {...(rest as HTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  if (onClick)
    return (
      <button type="button" className={c} onClick={onClick} disabled={disabled} aria-pressed={selected} {...(rest as HTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  return (
    <div className={c} {...rest}>
      {children}
    </div>
  );
}

export function Panel({ title, actions, children, flush, className, as: Tag = 'section' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; as?: 'section' | 'div' | 'aside' }) {
  return (
    <Tag className={`zd-panel${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="zd-panel-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions}
        </header>
      )}
      <div className={`zd-panel-body${flush ? ' zd-panel-body--flush' : ''}`}>{children}</div>
    </Tag>
  );
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return <hr className={`zd-divider${vertical ? ' zd-divider--v' : ''}`} aria-orientation={vertical ? 'vertical' : 'horizontal'} />;
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'red' | 'blue';

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`zd-badge${tone !== 'neutral' ? ` zd-badge--${tone}` : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** Chip: a small token. Interactive when given onClick (toggle with `pressed`) or onRemove. */
export function Chip({ children, icon, pressed, onClick, onRemove, disabled, title }: { children: ReactNode; icon?: IconName; pressed?: boolean; onClick?: () => void; onRemove?: () => void; disabled?: boolean; title?: string }) {
  if (!onClick && !onRemove)
    return (
      <span className="zd-chip" title={title}>
        {icon && <Icon name={icon} />}
        {children}
      </span>
    );
  return (
    <button type="button" className="zd-chip" aria-pressed={onClick ? pressed : undefined} onClick={onClick ?? onRemove} disabled={disabled} title={title}>
      {icon && <Icon name={icon} />}
      {children}
      {onRemove && <Icon name="x" className="zd-chip-x" />}
    </button>
  );
}

/** Label left, tabular value right, unit in tertiary text. Values tween when numeric. */
export function StatRow({ label, value, unit, decimals = 0, big, tween = true }: { label: ReactNode; value: number | string; unit?: string; decimals?: number; big?: boolean; tween?: boolean }) {
  const n = useTween(typeof value === 'number' ? value : 0, tween && typeof value === 'number');
  const shown = typeof value === 'number' ? n.toFixed(decimals) : value;
  return (
    <div className={`zd-stat${big ? ' zd-stat--big' : ''}`}>
      <span className="zd-stat-label">{label}</span>
      <span className="zd-stat-value">
        {shown}
        {unit && <span className="zd-stat-unit">{unit}</span>}
      </span>
    </div>
  );
}

export function EmptyState({ icon, text, action }: { icon: IconName; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="zd-empty">
      <Icon name={icon} />
      <p>{text}</p>
      {action}
    </div>
  );
}

/** Collapsible group with a one-line summary in the header. */
export function Group({
  title,
  summary,
  children,
  defaultOpen = false,
  open: openProp,
  onToggle,
  onHover,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  onHover?: (on: boolean) => void;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const id = useId();
  return (
    <section className="zd-group" onMouseEnter={onHover && (() => onHover(true))} onMouseLeave={onHover && (() => onHover(false))}>
      <button
        type="button"
        className="zd-group-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOwn(!open);
          onToggle?.(!open);
        }}
        onFocus={onHover && (() => onHover(true))}
        onBlur={onHover && (() => onHover(false))}
      >
        <span className="zd-group-titles">
          <span className="zd-group-title">{title}</span>
          {summary && <span className="zd-group-summary">{summary}</span>}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="zd-group-body" id={id}>
          {children}
        </div>
      )}
    </section>
  );
}

/** Setting row: label + one-line description + control. `stack` puts the control under the text. */
export function Field({ label, description, children, stack, htmlFor }: { label: ReactNode; description?: ReactNode; children: ReactNode; stack?: boolean; htmlFor?: string }) {
  return (
    <div className={`zd-field${stack ? ' zd-field--stack' : ''}`}>
      <div className="zd-field-text">
        {htmlFor ? (
          <label className="zd-field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="zd-field-label">{label}</span>
        )}
        {description && <span className="zd-field-desc">{description}</span>}
      </div>
      <div className="zd-field-control">{children}</div>
    </div>
  );
}
