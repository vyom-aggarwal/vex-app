import { keyLabel } from '../../shared/input/bindings';
import { useDevice, usePadFamily, type PadFamily } from '../nav';

/**
 * KeyHint: the right glyph for the last input used (keyboard, Xbox or PlayStation).
 * Pass a semantic `action`, or explicit `code` (KeyboardEvent.code) and/or `pad` (standard button index).
 */

export type HintAction = 'confirm' | 'back' | 'menu' | 'tabPrev' | 'tabNext' | 'alt' | 'option';

const SEMANTIC: Record<HintAction, { code: string; pad: number }> = {
  confirm: { code: 'Enter', pad: 0 },
  back: { code: 'Escape', pad: 1 },
  menu: { code: 'Escape', pad: 9 },
  tabPrev: { code: 'BracketLeft', pad: 4 },
  tabNext: { code: 'BracketRight', pad: 5 },
  alt: { code: 'KeyX', pad: 2 },
  option: { code: 'KeyY', pad: 3 },
};

const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Guide'];
const PS_TEXT = ['', '', '', '', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'];

/** PlayStation face buttons are shapes, drawn rather than typed. */
function PsFace({ i }: { i: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      {i === 0 && <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" {...common} />}
      {i === 1 && <circle cx="6" cy="6" r="3.8" {...common} />}
      {i === 2 && <rect x="2.3" y="2.3" width="7.4" height="7.4" {...common} />}
      {i === 3 && <path d="M6 2 10 9.5H2z" {...common} />}
    </svg>
  );
}

const PS_NAMES = ['Cross', 'Circle', 'Square', 'Triangle'];

export function padButtonName(i: number, fam: PadFamily): string {
  if (fam === 'playstation') return i < 4 ? PS_NAMES[i] : PS_TEXT[i] ?? `Button ${i}`;
  return XBOX[i] ?? `Button ${i}`;
}

export function PadGlyph({ button, family }: { button: number; family: PadFamily }) {
  const face = family === 'playstation' && button < 4;
  return (
    <kbd className="zd-keyhint zd-keyhint--pad" aria-label={padButtonName(button, family)} title={padButtonName(button, family)}>
      {face ? <PsFace i={button} /> : padButtonName(button, family)}
    </kbd>
  );
}

export function KeyGlyph({ code }: { code: string }) {
  return <kbd className="zd-keyhint">{keyLabel(code)}</kbd>;
}

export interface KeyHintProps {
  action?: HintAction;
  code?: string;
  pad?: number;
  /** Force a device instead of following the last input. */
  device?: 'keyboard' | PadFamily;
}

export function KeyHint({ action, code, pad, device: forced }: KeyHintProps) {
  const dev = useDevice();
  const fam = usePadFamily();
  const k = action ? SEMANTIC[action].code : code;
  const p = action ? SEMANTIC[action].pad : pad;
  const which = forced ?? (dev === 'xbox' || dev === 'playstation' ? dev : 'keyboard');
  if (which === 'keyboard') return k ? <KeyGlyph code={k} /> : p !== undefined ? <PadGlyph button={p} family={fam} /> : null;
  return p !== undefined ? <PadGlyph button={p} family={which} /> : k ? <KeyGlyph code={k} /> : null;
}

/** A KeyHint followed by a short label, for hint rows ("A Select  B Back"). */
export function HintRow({ items }: { items: { hint: KeyHintProps; label: string }[] }) {
  return (
    <span className="zd-keyhint-row">
      {items.map((it) => (
        <span key={it.label} className="zd-keyhint-row">
          <KeyHint {...it.hint} />
          {it.label}
        </span>
      ))}
    </span>
  );
}
