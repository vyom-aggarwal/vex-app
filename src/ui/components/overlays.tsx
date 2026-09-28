import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tokenMs } from '../appearance';
import { Icon, type IconName } from '../icons';
import { useBack } from '../nav';
import { IconButton } from './Button';

// ---------------------------------------------------------------------------------------------
// Tooltip: appears after --tooltip-delay on hover or focus, placed beside (never over) its control.
// ---------------------------------------------------------------------------------------------

export function Tooltip({ label, children, placement = 'top' }: { label: ReactNode; children: ReactElement; placement?: 'top' | 'bottom' }) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const id = useId();
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 8;
      const below = placement === 'bottom' || r.top < 48;
      setPos({ x: r.left + r.width / 2, y: below ? r.bottom + gap : r.top - gap, below });
    }, tokenMs('--tooltip-delay', 400));
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <span ref={anchor} className="zd-tip-anchor" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide} aria-describedby={pos ? id : undefined}>
      {children}
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="zd-tooltip"
            style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.below ? '0' : '-100%'})` }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Dialog: modal, focus trapped, Esc / B closes, focus returns to the opener.
// ---------------------------------------------------------------------------------------------

export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useBack(() => onClose(), open);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
      first?.focus();
    });
    return () => {
      cancelAnimationFrame(t);
      opener.current?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="zd-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`zd-dialog${wide ? ' zd-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-nav-scope="dialog"
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const f = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
          if (!f.length) return;
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="zd-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
        </header>
        {children && <div className="zd-dialog-body">{children}</div>}
        {actions && <footer className="zd-dialog-actions">{actions}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------------------------
// Toasts: bottom-center, at most 3 visible, auto-dismiss after --dur-toast, paused on hover/focus.
// ---------------------------------------------------------------------------------------------

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastSpec {
  text: ReactNode;
  /** Bold lead-in (e.g. a rule ID). */
  title?: string;
  tone?: ToastTone;
  /** Alliance stripe (rule calls). */
  alliance?: 'red' | 'blue';
  action?: { label: string; onClick: () => void };
  /** Keep until dismissed. */
  sticky?: boolean;
}

interface ToastEntry extends ToastSpec {
  id: number;
}

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', ok: 'checkCircle', warn: 'warning', danger: 'danger' };

/** One toast card (also used directly by the in-match HUD). */
export function ToastCard({ toast, onDismiss }: { toast: ToastSpec; onDismiss?: () => void }) {
  const tone = toast.tone ?? 'info';
  return (
    <div className={`zd-toast zd-toast--${tone}${toast.alliance ? ` zd-toast--${toast.alliance}` : ''}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={TONE_ICON[tone]} />
      <span className="zd-toast-text">
        {toast.title && <b>{toast.title}</b>}
        {toast.text}
      </span>
      {toast.action && (
        <button
          type="button"
          className="zd-btn zd-btn--ghost zd-btn--sm"
          onClick={() => {
            toast.action!.onClick();
            onDismiss?.();
          }}
        >
          {toast.action.label}
        </button>
      )}
      {onDismiss && <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}

function TimedToast({ toast, onDone }: { toast: ToastEntry; onDone: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(tokenMs('--dur-toast', 4000));
  useEffect(() => {
    if (paused || toast.sticky) return;
    const t0 = performance.now();
    const t = window.setTimeout(() => onDone(toast.id), left.current);
    return () => {
      window.clearTimeout(t);
      left.current -= performance.now() - t0;
    };
  }, [paused, toast, onDone]);
  return (
    <div onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} style={{ width: '100%' }}>
      <ToastCard toast={toast} onDismiss={() => onDone(toast.id)} />
    </div>
  );
}

const ToastCtx = createContext<(t: ToastSpec) => void>(() => {});

/** Show a toast from anywhere under <ToastProvider>. */
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastEntry[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: ToastSpec) => setList((l) => [...l, { ...t, id: ++seq.current }]), []);
  const done = useCallback((id: number) => setList((l) => l.filter((x) => x.id !== id)), []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <ToastStack>
        {list.slice(0, 3).map((t) => (
          <TimedToast key={t.id} toast={t} onDone={done} />
        ))}
      </ToastStack>
    </ToastCtx.Provider>
  );
}

export function ToastStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`zd-toasts${className ? ` ${className}` : ''}`} aria-live="polite">
      {children}
    </div>
  );
}
