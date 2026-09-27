import type { DriverTuning } from '../input/mapping';
import { clamp } from '../sim/geometry';
import { sanitizeRobotConfig } from '../sim/robot';
import type { Alliance, RobotConfig, StartSide } from '../sim/types';

export interface Settings extends DriverTuning {
  alliance: Alliance;
  startSide: StartSide;
  /** Let the player drive during the 15 s autonomous period (practice only). */
  autonDrive: boolean;
  /** Draw the intake zone and release marker. */
  showZones: boolean;
}

export interface Records {
  best: { match: number | null; skills: number | null; free: number | null };
  career: {
    matchesPlayed: number;
    wins: number;
    skillsRuns: number;
    piecesScored: number;
    togglesFlipped: number;
    practiceSeconds: number;
  };
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  alliance: 'red',
  startSide: 'left',
  driveMode: 'split',
  fieldCentric: false,
  autoIntake: false,
  alignAssist: true,
  autoScore: false,
  deadzone: 0.08,
  curve: 'linear',
  maxSpeed: 1,
  autonDrive: false,
  showZones: true,
};

export function freshRecords(): Records {
  return {
    best: { match: null, skills: null, free: null },
    career: { matchesPlayed: 0, wins: 0, skillsRuns: 0, piecesScored: 0, togglesFlipped: 0, practiceSeconds: 0 },
  };
}

const KEYS = { settings: 'override-sim.settings.v1', robot: 'override-sim.robot.v1', records: 'override-sim.records.v1' };

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: settings just won't persist
  }
}

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly unknown[]).includes(v) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const numIn = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const best = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function sanitizeSettings(raw: unknown): Settings {
  const s = obj(raw);
  const d = DEFAULT_SETTINGS;
  return {
    alliance: oneOf(s.alliance, ['red', 'blue'] as const, d.alliance),
    startSide: oneOf(s.startSide, ['left', 'right'] as const, d.startSide),
    driveMode: oneOf(s.driveMode, ['tank', 'arcade', 'split'] as const, d.driveMode),
    fieldCentric: bool(s.fieldCentric, d.fieldCentric),
    autoIntake: bool(s.autoIntake, d.autoIntake),
    alignAssist: bool(s.alignAssist, d.alignAssist),
    autoScore: bool(s.autoScore, d.autoScore),
    deadzone: numIn(s.deadzone, 0, 0.3, d.deadzone),
    curve: oneOf(s.curve, ['linear', 'cubic'] as const, d.curve),
    maxSpeed: numIn(s.maxSpeed, 0.3, 1, d.maxSpeed),
    autonDrive: bool(s.autonDrive, d.autonDrive),
    showZones: bool(s.showZones, d.showZones),
  };
}

export function sanitizeRecords(raw: unknown): Records {
  const r = obj(raw);
  const b = obj(r.best);
  const c = obj(r.career);
  return {
    best: { match: best(b.match), skills: best(b.skills), free: best(b.free) },
    career: {
      matchesPlayed: count(c.matchesPlayed),
      wins: count(c.wins),
      skillsRuns: count(c.skillsRuns),
      piecesScored: count(c.piecesScored),
      togglesFlipped: count(c.togglesFlipped),
      practiceSeconds: count(c.practiceSeconds),
    },
  };
}

export const loadSettings = (): Settings => sanitizeSettings(read(KEYS.settings));
export const saveSettings = (s: Settings): void => write(KEYS.settings, s);
export const loadRobotConfig = (): RobotConfig => sanitizeRobotConfig(read(KEYS.robot));
export const saveRobotConfig = (c: RobotConfig): void => write(KEYS.robot, c);
export const loadRecords = (): Records => sanitizeRecords(read(KEYS.records));
export const saveRecords = (r: Records): void => write(KEYS.records, r);
