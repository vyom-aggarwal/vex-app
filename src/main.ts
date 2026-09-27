import { InputManager, type UiAction } from './input/input';
import { mapDriverInput } from './input/mapping';
import { PoseBuffer, Renderer } from './render/renderer';
import { computeScore, createSim, DT, NEUTRAL_COMMAND, PLAYER_ID, startMatch, stepSim, TICK_HZ } from './sim/sim';
import type { GameMode, RobotCommand, RobotConfig, SimState } from './sim/types';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { hideOverlay, pauseOverlay, resultsOverlay } from './ui/overlay';
import {
  freshRecords,
  loadRecords,
  loadRobotConfig,
  loadSettings,
  saveRecords,
  saveRobotConfig,
  saveSettings,
  type Records,
  type Settings,
} from './ui/storage';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const canvas = byId<HTMLCanvasElement>('field');
const overlayRoot = byId('overlay');

let settings: Settings = loadSettings();
let robotConfig: RobotConfig = loadRobotConfig();
let records: Records = loadRecords();

const renderer = new Renderer(canvas);
const input = new InputManager();
const hud = new Hud(byId('hud'));
const prev = new PoseBuffer();

/** menu: idle field behind menus · playing · paused · results: end-of-match breakdown. */
type View = 'menu' | 'playing' | 'paused' | 'results';
let view: View = 'menu';
let mode: GameMode = 'free';
let sim: SimState = buildSim('free');
let committed = true;
let acc = 0;
let last = performance.now();
const MAX_STEPS_PER_FRAME = 24;

function buildSim(m: GameMode): SimState {
  return createSim({
    mode: m,
    seed: (Math.random() * 0x100000000) >>> 0,
    playerAlliance: settings.alliance,
    autonDrive: settings.autonDrive,
    robots: [{ id: PLAYER_ID, alliance: settings.alliance, side: settings.startSide, config: robotConfig, human: true }],
  });
}

const menus = new Menus(byId('menu'), {
  play: (m) => startSession(m),
  settings: () => settings,
  saveSettings: (s) => {
    settings = s;
    saveSettings(s);
    refreshIdle();
  },
  robot: () => robotConfig,
  saveRobot: (c) => {
    robotConfig = c;
    saveRobotConfig(c);
    refreshIdle();
  },
  records: () => records,
  resetRecords: () => {
    records = freshRecords();
    saveRecords(records);
  },
});

/** Keep the field behind the menus in sync with the chosen alliance / robot. */
function refreshIdle(): void {
  if (view !== 'menu') return;
  sim = buildSim('free');
  prev.valid = false;
}

/** Fold the current session into career totals / bests (once). Returns true on a new personal best. */
function commit(final: boolean): boolean {
  if (committed) return false;
  committed = true;
  const me = sim.robots.find((r) => r.human);
  if (!me) return false;
  const c = records.career;
  c.piecesScored += me.stats.scored;
  c.togglesFlipped += me.stats.toggles;
  let pb = false;
  if (mode === 'free') {
    c.practiceSeconds += Math.floor(sim.phaseTick / TICK_HZ);
    if (me.stats.scored > 0 && (records.best.free === null || me.stats.scored > records.best.free)) {
      records.best.free = me.stats.scored;
      pb = true;
    }
  } else if (final && sim.finalScore) {
    const own = sim.finalScore[sim.playerAlliance].total;
    if (mode === 'match') {
      c.matchesPlayed++;
      const opp = sim.finalScore[sim.playerAlliance === 'red' ? 'blue' : 'red'].total;
      if (own > opp) c.wins++;
    } else {
      c.skillsRuns++;
    }
    const prevBest = records.best[mode];
    if (prevBest === null || own > prevBest) {
      records.best[mode] = own;
      pb = true;
    }
  }
  saveRecords(records);
  return pb;
}

function startSession(m: GameMode): void {
  commit(false);
  mode = m;
  sim = buildSim(m);
  prev.valid = false;
  committed = false;
  acc = 0;
  view = 'playing';
  menus.hide();
  hideOverlay(overlayRoot);
  hud.reset();
  hud.setVisible(true);
  input.gameActive = true;
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function toMenu(): void {
  commit(false);
  view = 'menu';
  input.gameActive = false;
  hud.setVisible(false);
  hideOverlay(overlayRoot);
  sim = buildSim('free');
  prev.valid = false;
  committed = true;
  menus.show('main');
}

function pause(): void {
  view = 'paused';
  pauseOverlay(overlayRoot, { resume, restart: () => startSession(mode), menu: toMenu });
}

function resume(): void {
  view = 'playing';
  hideOverlay(overlayRoot);
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function handleAction(a: UiAction): void {
  switch (view) {
    case 'menu':
      if (a === 'menu') menus.back();
      break;
    case 'paused':
      if (a === 'menu') resume();
      else if (a === 'restart') startSession(mode);
      break;
    case 'results':
      if (a === 'start' || a === 'restart') startSession(mode);
      else if (a === 'menu') toMenu();
      break;
    case 'playing':
      if (a === 'start') startMatch(sim);
      else if (a === 'restart') startSession(mode);
      else if (a === 'menu') pause();
      break;
  }
}

function frame(now: number): void {
  const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  input.poll();
  for (const a of input.takeActions()) handleAction(a);

  if (view === 'playing') {
    acc += elapsed;
    const me = sim.robots[0];
    const cmd: RobotCommand = me
      ? mapDriverInput(input.readPad(), input.readKeys(), settings, me.config.drivetrain, settings.alliance)
      : NEUTRAL_COMMAND;
    const cmds = { [PLAYER_ID]: cmd };
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      prev.capture(sim);
      stepSim(sim, cmds);
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    if (sim.phase === 'post') {
      const pb = commit(true);
      view = 'results';
      resultsOverlay(overlayRoot, sim, sim.finalScore ?? computeScore(sim), pb, { again: () => startSession(mode), menu: toMenu });
    }
  }

  const alpha = view === 'playing' ? acc / DT : 1;
  renderer.draw(sim, prev, alpha, settings.alliance, settings.showZones && view !== 'menu');
  if (view !== 'menu') hud.update(sim, computeScore(sim), settings, input.padName);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('beforeunload', () => commit(false));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && view === 'playing' && sim.phase !== 'pre') pause();
});

hud.setVisible(false);
menus.show('main');
requestAnimationFrame(frame);
