import { TICK_HZ, secondsToTicks } from './timestep';

/** Match-phase timer (pure, serializable). Driven one tick at a time by the engine. */

export type Phase = 'pre' | 'auton' | 'pause' | 'driver' | 'post' | 'free';

export interface MatchTiming {
  /** 0 for modes without an Autonomous period (skills, solo). */
  autonSec: number;
  /** Pause between Autonomous and Driver Control. */
  pauseSec: number;
  driverSec: number;
  /** The final N seconds of Driver Control. */
  endgameSec: number;
  /** Untimed (Free Drive). */
  untimed?: boolean;
}

export interface TimerState {
  phase: Phase;
  phaseTick: number;
  /** Ticks of match time elapsed across auton + driver (pause excluded). */
  matchTick: number;
}

export type TimerEvent = 'autonEnd' | 'driverStart' | 'end' | null;

export const newTimer = (t: MatchTiming): TimerState => ({ phase: t.untimed ? 'free' : 'pre', phaseTick: 0, matchTick: 0 });

export function startTimer(s: TimerState, t: MatchTiming): boolean {
  if (s.phase !== 'pre') return false;
  s.phase = t.autonSec > 0 ? 'auton' : 'driver';
  s.phaseTick = 0;
  return true;
}

export function phaseTicks(s: TimerState, t: MatchTiming): number {
  switch (s.phase) {
    case 'auton':
      return secondsToTicks(t.autonSec);
    case 'pause':
      return secondsToTicks(t.pauseSec);
    case 'driver':
      return secondsToTicks(t.driverSec);
    default:
      return Infinity;
  }
}

/** Advance one tick. Returns the transition that happened at the end of this tick, if any. */
export function tickTimer(s: TimerState, t: MatchTiming): TimerEvent {
  if (s.phase === 'pre' || s.phase === 'post') return null;
  s.phaseTick++;
  if (s.phase !== 'pause') s.matchTick++;
  if (s.phase === 'free' || s.phaseTick < phaseTicks(s, t)) return null;
  s.phaseTick = 0;
  if (s.phase === 'auton') {
    s.phase = t.pauseSec > 0 ? 'pause' : 'driver';
    return 'autonEnd';
  }
  if (s.phase === 'pause') {
    s.phase = 'driver';
    return 'driverStart';
  }
  s.phase = 'post';
  return 'end';
}

/** Seconds left in the current period; in Free Drive, seconds elapsed. */
export function timeRemaining(s: TimerState, t: MatchTiming): number {
  switch (s.phase) {
    case 'pre':
      return t.autonSec > 0 ? t.autonSec : t.driverSec;
    case 'free':
      return s.phaseTick / TICK_HZ;
    case 'post':
      return 0;
    default:
      return Math.max(0, (phaseTicks(s, t) - s.phaseTick) / TICK_HZ);
  }
}

export function isEndgame(s: TimerState, t: MatchTiming): boolean {
  return s.phase === 'driver' && timeRemaining(s, t) <= t.endgameSec;
}

/** Match seconds elapsed since the start of the first period (pause excluded). */
export const matchElapsed = (s: TimerState): number => s.matchTick / TICK_HZ;

export const robotsEnabled = (s: TimerState): boolean => s.phase === 'auton' || s.phase === 'driver' || s.phase === 'free';

export function formatClock(sec: number): string {
  const whole = Math.ceil(sec - 1e-9);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
