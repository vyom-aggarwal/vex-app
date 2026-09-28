import { normalizeBindings, type Bindings } from '../shared/input/bindings';
import { DEFAULT_TUNING, type DriverTuning } from '../shared/input/mapping';
import { loadJson, saveJson } from '../shared/storage';
import type { Alliance, BotLevel, BotStyle } from '../shared/types';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = Quality | 'auto';
export type CameraMode = 'driver' | 'driverTrack' | 'chase' | 'orbit' | 'overhead' | 'audience';
export type Theme = 'system' | 'light' | 'dark';
export type PerfReadout = 'off' | 'simple' | 'detailed';
export type Palette = 'standard' | 'colorblind';
export type MotionPref = 'system' | 'reduce' | 'full';

/** Who drives a partner / opponent slot. */
export interface BotSlot {
  kind: 'none' | 'dummy' | 'ai';
  level: BotLevel;
  style: BotStyle;
  /** Drive a copy of the player's robot instead of a preset. */
  mirror: boolean;
}

export interface Settings extends DriverTuning {
  /** Settings schema version (for one-time default changes). */
  v: number;
  /** Show placement / grab guides in matches. */
  guides: boolean;
  // Controls
  bindings: Bindings;
  triggerThreshold: number;
  // Match
  alliance: Alliance;
  /** Preferred starting spot within the alliance (index into the mode's start list). */
  startSlot: number;
  partner: BotSlot;
  opponent1: BotSlot;
  opponent2: BotSlot;
  autoRef: boolean;
  worlds: boolean;
  // Audio & visual
  master: number;
  sfx: number;
  voice: number;
  theme: Theme;
  /** Menu focus/select ticks. */
  uiSounds: boolean;
  /** Top-bar mute: silences everything without touching the levels. */
  muted: boolean;
  messages: boolean;
  // Accessibility
  palette: Palette;
  /** UI scale (0.9–1.3): scales the type and spacing tokens. */
  uiScale: number;
  motion: MotionPref;
  /** Hide everything in a match except the score bar. */
  cleanHud: boolean;
  perf: PerfReadout;
  // Graphics
  view: '3d' | '2d';
  camera: CameraMode;
  /** Driver height (in), used by the driver-station camera. */
  driverHeight: number;
  quality: QualitySetting;
}

export const SETTINGS_VERSION = 3;

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_TUNING,
  v: SETTINGS_VERSION,
  guides: true,
  bindings: normalizeBindings(undefined),
  triggerThreshold: 0.35,
  alliance: 'red',
  startSlot: 0,
  partner: { kind: 'ai', level: 'normal', style: 'mixed', mirror: false },
  opponent1: { kind: 'ai', level: 'normal', style: 'scorer', mirror: false },
  opponent2: { kind: 'ai', level: 'normal', style: 'defender', mirror: false },
  autoRef: true,
  worlds: false,
  master: 0.8,
  sfx: 1,
  voice: 1,
  theme: 'dark',
  uiSounds: true,
  muted: false,
  messages: true,
  palette: 'standard',
  uiScale: 1,
  motion: 'system',
  cleanHud: false,
  perf: 'off',
  view: '3d',
  camera: 'driver',
  driverHeight: 68,
  quality: 'auto',
};

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

function slot(v: unknown, d: BotSlot): BotSlot {
  const s = (v ?? {}) as Partial<BotSlot>;
  return {
    kind: oneOf(s.kind, ['none', 'dummy', 'ai'] as const, d.kind),
    level: oneOf(s.level, ['easy', 'normal', 'hard'] as const, d.level),
    style: oneOf(s.style, ['scorer', 'controller', 'defender', 'mixed'] as const, d.style),
    mirror: typeof s.mirror === 'boolean' ? s.mirror : d.mirror,
  };
}

/** Load settings, repairing anything missing or malformed (older versions, hand edits). */
export function loadSettings(): Settings {
  const raw = loadJson<Partial<Settings> & Record<string, unknown>>('settings', {});
  const d = DEFAULT_SETTINGS;
  // Settings saved before v3 predate auto-place/auto-lift being on by default: switch them on once.
  const old = typeof raw.v !== 'number' || raw.v < 3;
  return {
    ...d,
    v: SETTINGS_VERSION,
    guides: typeof raw.guides === 'boolean' ? raw.guides : d.guides,
    assistLift: old || typeof raw.assistLift !== 'boolean' ? d.assistLift : raw.assistLift,
    driveMode: oneOf(raw.driveMode, ['tank', 'arcade', 'split'] as const, d.driveMode),
    deadzone: typeof raw.deadzone === 'number' ? Math.min(0.4, Math.max(0, raw.deadzone)) : d.deadzone,
    curve: typeof raw.curve === 'number' ? Math.min(3, Math.max(1, raw.curve)) : raw.curve === 'cubic' ? 3 : d.curve,
    maxSpeed: typeof raw.maxSpeed === 'number' ? Math.min(1, Math.max(0.2, raw.maxSpeed)) : d.maxSpeed,
    fieldCentric: typeof raw.fieldCentric === 'boolean' ? raw.fieldCentric : d.fieldCentric,
    assistAlign: typeof raw.assistAlign === 'boolean' ? raw.assistAlign : d.assistAlign,
    assistGrab: typeof raw.assistGrab === 'boolean' ? raw.assistGrab : d.assistGrab,
    assistPlace: old || typeof raw.assistPlace !== 'boolean' ? d.assistPlace : raw.assistPlace,
    assistTool: typeof raw.assistTool === 'boolean' ? raw.assistTool : d.assistTool,
    keyTurn: typeof raw.keyTurn === 'number' ? Math.min(1, Math.max(0.3, raw.keyTurn)) : d.keyTurn,
    bindings: normalizeBindings(raw.bindings as Partial<Bindings> | undefined),
    triggerThreshold: typeof raw.triggerThreshold === 'number' ? Math.min(0.95, Math.max(0.05, raw.triggerThreshold)) : d.triggerThreshold,
    alliance: oneOf(raw.alliance, ['red', 'blue'] as const, d.alliance),
    startSlot: typeof raw.startSlot === 'number' && raw.startSlot >= 0 ? Math.floor(raw.startSlot) : d.startSlot,
    partner: slot(raw.partner, d.partner),
    opponent1: slot(raw.opponent1, d.opponent1),
    opponent2: slot(raw.opponent2, d.opponent2),
    autoRef: typeof raw.autoRef === 'boolean' ? raw.autoRef : d.autoRef,
    worlds: typeof raw.worlds === 'boolean' ? raw.worlds : d.worlds,
    master: clamp01(raw.master, d.master),
    sfx: clamp01(raw.sfx, d.sfx),
    voice: clamp01(raw.voice, d.voice),
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    uiSounds: typeof raw.uiSounds === 'boolean' ? raw.uiSounds : d.uiSounds,
    muted: typeof raw.muted === 'boolean' ? raw.muted : d.muted,
    messages: typeof raw.messages === 'boolean' ? raw.messages : d.messages,
    palette: oneOf(raw.palette, ['standard', 'colorblind'] as const, d.palette),
    uiScale: typeof raw.uiScale === 'number' ? Math.min(1.3, Math.max(0.9, raw.uiScale)) : d.uiScale,
    motion: oneOf(raw.motion, ['system', 'reduce', 'full'] as const, d.motion),
    cleanHud: typeof raw.cleanHud === 'boolean' ? raw.cleanHud : d.cleanHud,
    perf: oneOf(raw.perf, ['off', 'simple', 'detailed'] as const, d.perf),
    view: oneOf(raw.view, ['3d', '2d'] as const, d.view),
    camera: oneOf(raw.camera, ['driver', 'driverTrack', 'chase', 'orbit', 'overhead', 'audience'] as const, d.camera),
    driverHeight: typeof raw.driverHeight === 'number' ? Math.min(90, Math.max(40, raw.driverHeight)) : d.driverHeight,
    quality: oneOf(raw.quality, ['auto', 'low', 'medium', 'high', 'ultra'] as const, d.quality),
  };
}

export const saveSettings = (s: Settings): void => void saveJson('settings', s);
