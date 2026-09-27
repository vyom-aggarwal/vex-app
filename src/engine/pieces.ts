import type { StackLevel } from './types';

/**
 * Shared Pin / Cup / Goal geometry (inches), from docs/games/override.md (Pinnacle uses the same pieces).
 * Pin: two 3.25" halves joined by a hex collar; each half is a cone from Ø2.35 at the collar to Ø1.40 at the tip.
 * Cup: hourglass, Ø3.16 rims, Ø2.32 waist, one clear half and one opaque half.
 */
export const PIN = {
  height: 6.5,
  half: 3.25,
  collarAF: 3.02,
  collarAC: 3.16,
  collarThick: 0.64,
  coneBase: 2.35,
  tip: 1.4,
  /** Collar top above the pin's bottom end. */
  collarTop: 3.25 + 0.32,
  /** Length of a cone below the collar (how deep a half can enter an opening). */
  insert: 2.93,
  massKg: 0.06, // EST
};

export const CUP = {
  height: 6.48,
  half: 3.24,
  rim: 3.16,
  waist: 2.32,
  massKg: 0.05, // EST
};

export const GOAL = {
  width: 5.61,
  opening: 2.37,
};

/**
 * Horizontal distance (in) from an opening's axis within which a released piece snaps in. EST: the Pin tip
 * (Ø1.40) tapers up to Ø2.35, and the opening is Ø2.37, so a tip landing up to ~0.9" off-center funnels in.
 */
export const SNAP_RADIUS = 0.9;
/** Vertical window above the stack top in which a descending piece may snap (in). EST. */
export const SNAP_ABOVE = 3.5;
export const SNAP_BELOW = 1.2;

/**
 * Z (in) of each level's bottom end, given the opening height of the goal.
 * A Pin's collar rests on the rim below it; a Cup's rim rests on the collar of the Pin below it.
 */
export function levelBottoms(goalHeight: number, levels: StackLevel[]): number[] {
  const out: number[] = [];
  let top = goalHeight; // rim of the current opening
  let lastPinBottom = 0;
  for (const l of levels) {
    if (l.kind === 'pins') {
      const b = top - PIN.insert;
      out.push(b);
      lastPinBottom = b;
      top = b + PIN.collarTop; // collar top: what a Cup rim sits on
    } else {
      const b = out.length === 0 ? goalHeight : lastPinBottom + PIN.collarTop;
      out.push(b);
      top = b + CUP.height;
    }
  }
  return out;
}

/** Height (in) of the surface the next piece would rest on, and what kind of piece may go there. */
export function stackTop(goalHeight: number, levels: StackLevel[]): { z: number; accepts: 'pin' | 'cup' } {
  if (levels.length === 0) return { z: goalHeight, accepts: 'pin' };
  const bottoms = levelBottoms(goalHeight, levels);
  const last = levels[levels.length - 1];
  const b = bottoms[bottoms.length - 1];
  return last.kind === 'pins' ? { z: b + PIN.collarTop, accepts: 'cup' } : { z: b + CUP.height, accepts: 'pin' };
}

/** Center height of a level given its bottom. */
export const levelCenter = (kind: 'pin' | 'cup', bottom: number): number => bottom + (kind === 'pin' ? PIN.half : CUP.half);
