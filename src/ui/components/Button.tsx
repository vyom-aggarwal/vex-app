import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { navigate } from '../router';
import { KeyHint, type KeyHintProps } from './KeyHint';
import { Spinner } from './surfaces';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Trailing icon (e.g. a chevron). */
  iconEnd?: IconName;
  hint?: KeyHintProps;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

const cls = (v: ButtonVariant, s: ButtonSize, extra: string[]): string =>
  ['zd-btn', `zd-btn--${v}`, s !== 'md' ? `zd-btn--${s}` : '', ...extra].filter(Boolean).join(' ');

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {}

export function Button({ variant = 'secondary', size = 'md', icon, iconEnd, hint, loading, block, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cls(variant, size, [block ? 'zd-btn--block' : '', className ?? ''])}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 'var(--icon-sm)' : 'var(--icon-md)'} /> : null}
      {children}
      {iconEnd && <Icon name={iconEnd} size="var(--icon-sm)" />}
      {hint && <KeyHint {...hint} />}
    </button>
  );
}

/** An in-app link styled as a button (client-side navigation). */
export function LinkButton({ to, variant = 'secondary', size = 'md', icon, iconEnd, hint, block, children, className, onClick, ...rest }: CommonProps & { to: string; className?: string; onClick?: () => void; 'aria-label'?: string; 'data-autofocus'?: boolean }) {
  return (
    <a
      href={to}
      className={cls(variant, size, [block ? 'zd-btn--block' : '', className ?? ''])}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 'var(--icon-sm)' : 'var(--icon-md)'} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size="var(--icon-sm)" />}
      {hint && <KeyHint {...hint} />}
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: icon-only buttons are labelled for screen readers. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressed?: boolean;
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', pressed, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cls(variant, size, ['zd-btn--icon', pressed ? 'zd-btn--pressed' : '', className ?? ''])}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 'var(--icon-sm)' : 'var(--icon-md)'} />
    </button>
  );
}
