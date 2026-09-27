import { effectorSlots, storageCapacity } from '../engine/mechanism';
import { Session, type Controller, type Toast } from '../engine/session';
import type { GameDefinition, ScoreResult, ViolationCall } from '../engine/types';
import { InputManager, type UiAction } from '../shared/input/input';
import { mapDriverInput } from '../shared/input/mapping';
import { formatClock, type Phase } from '../shared/matchTimer';
import type { Replay } from '../shared/replay';
import { FixedTimestep } from '../shared/timestep';
import { PIN_HALVES, type Alliance, type HpCommand, type ModeId, type PinType, type RobotEntry } from '../shared/types';
import { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type WorldInfo, type ZRenderer } from '../render/renderer';
import type { Settings } from './settings';

/** Match-load choices for the human player. */
export type LoadKind = 'pin' | 'yellow' | 'cup' | 'pair';
export const LOAD_LABELS: Record<LoadKind, string> = { pin: 'Alliance Pin', yellow: 'Yellow Pin', cup: 'Cup', pair: 'Cup + Pin (nested)' };

export interface HudState {
  phase: Phase;
  clock: string;
  endgame: boolean;
  red: number;
  blue: number;
  lines: ScoreResult['lines'];
  camera: string;
  loader: string;
  loaderIndex: number;
  loadKind: LoadKind;
  supply: { pins: number; cups: number };
  toasts: Toast[];
  holding: string;
  air: number | null;
  paused: boolean;
  pad: string | null;
  modeLabel: string;
  canLoad: boolean;
}

export interface FinishInfo {
  result: ScoreResult;
  calls: ViolationCall[];
  replay: Replay;
  playerAlliance: Alliance;
  redCards: number[];
  stats: { placed: number; loads: number; seconds: number };
}

/** Owns the frame loop for a live session: input → commands → fixed-step sim → interpolated render. */
export class GameRunner {
  readonly session: Session;
  readonly game: GameDefinition;
  readonly modeId: ModeId;
  private renderer: ZRenderer;
  private input = new InputManager();
  private clock = new FixedTimestep();
  private prev: Float32Array;
  private cur: Float32Array;
  private raf = 0;
  private last = 0;
  private hudTimer = 0;
  private pendingHp: HpCommand[] = [];
  paused = false;
  settings: Settings;
  loaderIndex = 0;
  loadKind: LoadKind = 'pin';
  spawnPin: PinType = 'YY';
  onHud: (h: HudState) => void = () => {};
  onFinish: (f: FinishInfo) => void = () => {};
  onMenu: () => void = () => {};
  onReset: () => void = () => {};
  private finished = false;

  constructor(renderer: ZRenderer, game: GameDefinition, modeId: ModeId, entries: RobotEntry[], settings: Settings, session: Session) {
    this.renderer = renderer;
    this.game = game;
    this.modeId = modeId;
    this.settings = settings;
    this.session = session;
    renderer.alliance = entries[0]?.alliance ?? 'red';
    renderer.loadGame(game);
    renderer.setWorld(this.worldInfo());
    renderer.setCamera(settings.camera);
    const own = this.ownLoaders();
    this.loaderIndex = own[0] ?? 0;
    this.cur = session.sim.poses();
    this.prev = this.cur.slice();
    this.input.gameActive = true;
  }

  static async create(renderer: ZRenderer, game: GameDefinition, modeId: ModeId, entries: RobotEntry[], settings: Settings, controllers: (Controller | null)[], seed: number): Promise<GameRunner> {
    const session = await Session.create({ game, modeId, robots: entries, seed, autoRef: settings.autoRef, worlds: settings.worlds }, controllers);
    return new GameRunner(renderer, game, modeId, entries, settings, session);
  }

  worldInfo(): WorldInfo {
    const sim = this.session.sim;
    return {
      objects: sim.state.objects.map((o) => ({ kind: o.kind, pin: o.pin, hidden: o.loc === 'supply' || (o.loc === 'loader' && !sim.state.loaders.some((l) => l.presented === o.id) && o.base < 0) })),
      robots: sim.state.robots.map((r) => ({ spec: sim.specs[r.index], alliance: r.alliance })),
    };
  }

  private get alliance(): Alliance {
    return this.session.sim.state.robots[0]?.alliance ?? 'red';
  }

  private ownLoaders(): number[] {
    const mode = this.session.sim.mode;
    const allowed = mode.loaderAccess[this.alliance];
    return this.game.field.loaders.map((l, i) => (allowed.includes(l.alliance) ? i : -1)).filter((i) => i >= 0);
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Begin the match (leave the pre-match state). */
  go(): void {
    if (this.session.start()) this.paused = false;
  }

  private handle(a: UiAction): void {
    const sim = this.session.sim;
    switch (a) {
      case 'start':
        if (sim.phase === 'pre') this.go();
        else this.paused = !this.paused;
        break;
      case 'menu':
        this.paused = !this.paused;
        break;
      case 'reset':
        this.onReset();
        break;
      case 'camera': {
        const i = CAMERA_MODES.indexOf(this.renderer.mode);
        this.renderer.setCamera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
        break;
      }
      case 'view2d':
        this.renderer.setCamera(this.renderer.mode === 'overhead' ? this.settings.camera === 'overhead' ? 'driver' : this.settings.camera : 'overhead');
        break;
      case 'load':
        this.queueLoad();
        break;
      case 'loaderPrev':
      case 'loaderNext': {
        const own = this.ownLoaders();
        if (own.length === 0) break;
        const k = own.indexOf(this.loaderIndex);
        this.loaderIndex = own[(k + (a === 'loaderNext' ? 1 : own.length - 1)) % own.length];
        break;
      }
      case 'kindPin':
        this.loadKind = 'pin';
        break;
      case 'kindYellow':
        this.loadKind = 'yellow';
        break;
      case 'kindCup':
        this.loadKind = 'cup';
        break;
      case 'kindPair':
        this.loadKind = 'pair';
        break;
      case 'spawn':
        if (sim.phase === 'free') this.pendingHp.push({ alliance: this.alliance, loader: -1, pin: this.loadKind === 'cup' ? null : this.spawnPinType(), cup: this.loadKind === 'cup' });
        break;
    }
  }

  private spawnPinType(): PinType {
    if (this.loadKind === 'yellow') return 'YY';
    return this.alliance === 'red' ? 'RY' : 'BY';
  }

  /** Feed the next Match Load of the chosen kind into the chosen Loader. */
  queueLoad(): void {
    const def = this.game.field.loaders[this.loaderIndex];
    if (!def) return;
    const own: PinType = def.alliance === 'red' ? 'RY' : 'BY';
    const pin: PinType | null = this.loadKind === 'cup' ? null : this.loadKind === 'yellow' ? 'YY' : this.loadKind === 'pair' ? (this.hasSupply(def.alliance, own) ? own : 'YY') : own;
    this.pendingHp.push({ alliance: this.alliance, loader: this.loaderIndex, pin, cup: this.loadKind === 'cup' || this.loadKind === 'pair' });
  }

  private hasSupply(a: Alliance, t: PinType): boolean {
    return this.session.sim.state.objects.some((o) => o.loc === 'supply' && o.supply === a && o.pin === t);
  }

  setLoader(i: number): void {
    if (this.ownLoaders().includes(i)) this.loaderIndex = i;
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.poll();
    for (const a of this.input.takeActions()) this.handle(a);
    const sim = this.session.sim;
    const me = sim.state.robots[0];
    if (!this.paused && sim.phase !== 'post') {
      const human = this.session.controllers[0] ? null : mapDriverInput(this.input.readPad(), this.input.readKeys(), this.settings, sim.specs[0].drive.type, me.alliance);
      const cmd = this.modeId === 'solocode' ? null : human;
      this.clock.advance(dt, () => {
        this.prev = this.cur;
        const hp = this.pendingHp;
        this.pendingHp = [];
        this.session.tick(cmd, hp);
        this.cur = sim.poses();
      });
    }
    if (this.prev.length !== this.cur.length || this.renderer.objectCount !== sim.state.objects.length) {
      this.renderer.syncObjects(this.worldInfo());
      this.prev = this.cur.slice();
    } else if (this.hudTimer <= 0) this.renderer.syncObjects(this.worldInfo());
    this.renderer.applyPoses(this.prev, this.cur, this.paused ? 1 : this.clock.alpha);
    this.renderer.render(0, dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.onHud(this.hud());
    }
    if (sim.phase === 'post' && !this.finished) {
      this.finished = true;
      this.finish();
    }
  }

  hud(): HudState {
    const sim = this.session.sim;
    const score = sim.score();
    const me = sim.state.robots[0];
    const def = this.game.field.loaders[this.loaderIndex];
    const pool = sim.state.objects.filter((o) => o.loc === 'supply' && o.supply === def?.alliance);
    const held = me ? [...me.slots.filter((x) => x >= 0), ...me.store] : [];
    const names = held.map((id) => {
      const o = sim.obj(id);
      if (o.kind === 'cup') return 'Cup';
      const [a, b] = PIN_HALVES[o.pin!];
      return `${a[0].toUpperCase()}/${b[0].toUpperCase()} Pin`;
    });
    const spec = sim.specs[0];
    const needsAir = spec.effector.actuation === 'pneumatic' || spec.tool.type === 'flipper';
    const t = sim.remaining;
    return {
      phase: sim.phase,
      clock: formatClock(t),
      endgame: sim.endgame,
      red: score.red,
      blue: score.blue,
      lines: score.lines,
      camera: CAMERA_LABELS[this.renderer.mode as CameraMode],
      loader: def ? `${def.alliance === 'red' ? 'Red' : 'Blue'} ${def.x > 0 ? 'right' : 'left'}` : '—',
      loaderIndex: this.loaderIndex,
      loadKind: this.loadKind,
      supply: { pins: pool.filter((o) => o.kind === 'pin').length, cups: pool.filter((o) => o.kind === 'cup').length },
      toasts: this.settings.showToasts ? this.session.toasts.filter((x) => sim.state.tick - x.tick < 4 * 120) : [],
      holding: names.length ? names.join(' + ') : `Empty (${effectorSlots(spec).length} grip${effectorSlots(spec).length > 1 ? 's' : ''}${storageCapacity(spec) ? ` + ${storageCapacity(spec)} intake` : ''})`,
      air: needsAir ? me.pneu : null,
      paused: this.paused,
      pad: this.input.padName,
      modeLabel: sim.mode.label,
      canLoad: sim.mode.loadPhases.includes(sim.phase),
    };
  }

  private finish(): void {
    const sim = this.session.sim;
    const result = sim.state.final ?? sim.score();
    const me = sim.state.robots[0];
    const a = me.alliance;
    const carded = sim.state.ref.redCards.includes(0);
    const player = carded ? 0 : result[a];
    this.onHud(this.hud());
    this.onFinish({
      result,
      calls: sim.state.ref.calls,
      replay: this.session.replay({ red: result.red, blue: result.blue, player }),
      playerAlliance: a,
      redCards: sim.state.ref.redCards,
      stats: { placed: me.stats.placed, loads: me.stats.loads, seconds: sim.state.timer.matchTick / 120 },
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
  }

  dispose(): void {
    this.stop();
    this.session.dispose();
  }
}
