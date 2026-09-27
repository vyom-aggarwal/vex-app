import { PIN_HALVES, type CupHalf, type HalfColor } from '../shared/types';
import type { GoalStack, StackLevel, StackPin } from './types';

/**
 * Pure analysis of a logical goal stack (bottom → top). Levels alternate Pins and Cups; a Pins level
 * normally holds one Pin, but can hold more when several are crammed into one opening (which breaks
 * Override SC2's one-half-per-opening rule).
 *
 * A Pin's lower half sits in the opening below it (the Goal, or the upper half of the Cup under it);
 * its upper half sits in the lower half of the Cup above it, if any.
 */

export interface HalfInfo {
  color: HalfColor;
  visible: boolean;
}

export interface PinInfo {
  id: number;
  level: number;
  placed: boolean;
  /** [lower half, upper half] */
  halves: [HalfInfo, HalfInfo];
}

export interface CupInfo {
  id: number;
  level: number;
  placed: boolean;
  down: CupHalf;
}

export interface StackInfo {
  goalId: string;
  pins: PinInfo[];
  cups: CupInfo[];
}

const up = (h: CupHalf): CupHalf => (h === 'clear' ? 'opaque' : 'clear');

/**
 * @param oneHalfRule Override SC2: each Goal / Cup half nested with a Pin may contain at most one Pin half.
 */
export function analyzeStack(stack: GoalStack, oneHalfRule: boolean): StackInfo {
  const pins: PinInfo[] = [];
  const cups: CupInfo[] = [];
  const L = stack.levels;
  // Whether the opening below the current level can support Placed pins.
  let belowOk = true; // the Goal itself
  let belowOpaque = false;
  for (let i = 0; i < L.length; i++) {
    const lvl = L[i];
    if (lvl.kind === 'pins') {
      const above = L[i + 1];
      const crowded = oneHalfRule && lvl.pins.length > 1;
      const placed: boolean = belowOk && !crowded && lvl.pins.length > 0;
      const aboveOpaque = above?.kind === 'cup' && above.down === 'opaque';
      for (const p of lvl.pins) {
        const colors = PIN_HALVES[p.pin];
        pins.push({
          id: p.id,
          level: i,
          placed,
          halves: [
            { color: colors[p.down], visible: !belowOpaque },
            { color: colors[1 - p.down], visible: !aboveOpaque },
          ],
        });
      }
      // The next level must be a Cup; its placement depends on these pins.
      belowOk = placed;
      belowOpaque = false;
    } else {
      const prev = L[i - 1];
      const placed: boolean = i > 0 && prev.kind === 'pins' && belowOk;
      cups.push({ id: lvl.id, level: i, placed, down: lvl.down });
      belowOk = placed;
      belowOpaque = up(lvl.down) === 'opaque';
    }
  }
  return { goalId: stack.goalId, pins, cups };
}

/** Visible halves of Placed pins in a stack. */
export function visibleHalves(info: StackInfo): HalfColor[] {
  const out: HalfColor[] = [];
  for (const p of info.pins) if (p.placed) for (const h of p.halves) if (h.visible) out.push(h.color);
  return out;
}

export const placedCups = (info: StackInfo): number => info.cups.filter((c) => c.placed).length;

/** All object ids in a stack, bottom → top. */
export function stackIds(levels: StackLevel[]): number[] {
  const ids: number[] = [];
  for (const l of levels) {
    if (l.kind === 'pins') for (const p of l.pins) ids.push(p.id);
    else ids.push(l.id);
  }
  return ids;
}

/** Builder helpers for tests and game setups: pin(type, lowerColor), cup(downHalf). */
export function pinLevel(...pins: StackPin[]): StackLevel {
  return { kind: 'pins', pins };
}
export function cupLevel(id: number, down: CupHalf): StackLevel {
  return { kind: 'cup', id, down };
}
