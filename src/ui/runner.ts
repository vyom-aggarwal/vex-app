import { effectorSlots, storageCapacity } from '../engine/mechanism';
import { Session, type Controller, type Toast } from '../engine/session';
import type { GameDefinition, ScoreResult, ViolationCall } from '../engine/types';
import { InputManager, type UiAction } from '../shared/input/input';
import { KeyRamp, mapDriverInput } from '../shared/input/mapping';
import { formatClock, type Phase } from '../shared/matchTimer';
import type { Replay } from '../shared/replay';
import { FixedTimestep, TICK_HZ } from '../shared/timestep';
import { NEUTRAL_COMMAND, PIN_HALVES, type Alliance, type HpCommand, type ModeId, type PinType, type RobotCommand, type RobotEntry } from '../shared/types';
import { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type WorldInfo, type ZRenderer } from '../render/renderer';
import { AutoQuality } from './quality';
import type { Settings } from './settings';
import { play, say } from './sound';

/** Match-load choices for the human player. */
export type LoadKind = 'pin' | 'opp' | 'yellow' | 'cup' | 'pair';
export const LOAD_LABELS: Record<LoadKind, string> = { pin: 'Alliance Pin', opp: 'Other Pin', yellow: 'Yellow Pin', cup: 'Cup', pair: 'Cup + Pin' };

export interface PerfInfo {
  fps: number;
  simMs: number;
  drawMs: number;
  calls: number;
  triangles: number;
  quality: string;
}

export interface HudState {
  phase: Phase;
  clock: string;
  endgame: boolean;
  red: number;
  blue: number;
  lines: ScoreResult['lines'];
  camera: string;
  loaderIndex: number;
  loadKind: LoadKind;
  supply: { pins: number; cups: number };
  toasts: Toast[];
  holding: string;
  air: number | null;
  paused: boolean;
  pad: string | null;
  canLoad: boolean;
  anyLoading: boolean;
  breakdown: boolean;
  perf: PerfInfo | null;
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
  private input: InputManager;
  private clock = new FixedTimestep();
  private ramp = new KeyRamp();
  private frameDt = 1 / 60;
  private prev: Float32Array;
  private cur: Float32Array;
  private raf = 0;
  private last = 0;
  private hudTimer = 0;
  private pendingHp: HpCommand[] = [];
  private finished = false;
  private autoQ: AutoQuality;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private simMs = 0;
  private lastSecond = -1;
  private lastPhase: Phase;
  paused = false;
  breakdown = false;
  settings: Settings;
  loaderIndex = 0;
  loadKind: LoadKind = 'pin';
  onHud: (h: HudState) => void = () => {};
  onFinish: (f: FinishInfo) => void = () => {};
  onReset: () => void = () => {};

  constructor(renderer: ZRenderer, game: GameDefinition, modeId: ModeId, entries: RobotEntry[], settings: Settings, session: Session) {
    this.renderer = renderer;
    this.game = game;
    this.modeId = modeId;
    this.settings = settings;
    this.session = session;
    this.input = new InputManager(settings.bindings, { triggerThreshold: settings.triggerThreshold });
    this.autoQ = new AutoQuality(settings.quality === 'auto');
    renderer.alliance = entries[0]?.alliance ?? 'red';
    renderer.setDriverHeight(settings.driverHeight);
    renderer.loadGame(game);
    renderer.setWorld(this.worldInfo());
    renderer.setCamera(settings.view === '2d' ? 'overhead' : settings.camera);
    this.loaderIndex = this.ownLoaders()[0] ?? 0;
    this.cur = session.sim.poses();
    this.prev = this.cur.slice();
    this.lastPhase = session.sim.phase;
    this.input.gameActive = true;
    if (import.meta.env?.DEV) (window as unknown as { __zdrive?: GameRunner }).__zdrive = this;
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

  ownLoaders(): number[] {
    const allowed = this.session.sim.mode.loaderAccess[this.alliance];
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
    if (this.session.start()) {
      this.paused = false;
      play('start');
    }
  }

  cycleCamera(): void {
    const i = CAMERA_MODES.indexOf(this.renderer.mode);
    this.renderer.setCamera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  }

  setCamera(m: CameraMode): void {
    this.renderer.setCamera(m);
  }

  private handle(a: UiAction): void {
    const sim = this.session.sim;
    switch (a) {
      case 'start':
        if (sim.phase === 'pre') this.go();
        else if (sim.phase !== 'post') this.paused = !this.paused;
        break;
      case 'menu':
        if (sim.phase !== 'post') this.paused = !this.paused;
        break;
      case 'reset':
        this.onReset();
        break;
      case 'camera':
        this.cycleCamera();
        break;
      case 'view2d':
        this.renderer.setCamera(this.renderer.mode === 'overhead' ? (this.settings.camera === 'overhead' ? 'driver' : this.settings.camera) : 'overhead');
        break;
      case 'breakdown':
        this.breakdown = !this.breakdown;
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
        play('click');
        break;
      }
      case 'kindPin':
      case 'kindOpp':
      case 'kindYellow':
      case 'kindCup':
      case 'kindPair':
        this.loadKind = ({ kindPin: 'pin', kindOpp: 'opp', kindYellow: 'yellow', kindCup: 'cup', kindPair: 'pair' } as const)[a];
        play('click');
        break;
      case 'spawn':
        if (sim.phase === 'free') this.pendingHp.push({ alliance: this.alliance, loader: -1, pin: this.loadKind === 'cup' ? null : this.pinFor(this.alliance), cup: this.loadKind === 'cup' });
        break;
    }
  }

  private pinFor(a: Alliance): PinType {
    if (this.loadKind === 'yellow') return 'YY';
    const own: PinType = a === 'red' ? 'RY' : 'BY';
    const opp: PinType = a === 'red' ? 'BY' : 'RY';
    return this.loadKind === 'opp' ? opp : own;
  }

  /** Feed the next Match Load of the chosen kind into the chosen Loader. */
  queueLoad(): void {
    const def = this.game.field.loaders[this.loaderIndex];
    if (!def) return;
    const k = this.loadKind;
    const own: PinType = def.alliance === 'red' ? 'RY' : 'BY';
    const opp: PinType = def.alliance === 'red' ? 'BY' : 'RY';
    const pin: PinType | null =
      k === 'cup' ? null : k === 'yellow' ? 'YY' : k === 'opp' ? opp : k === 'pair' ? ([own, 'YY', opp] as PinType[]).find((t) => this.hasSupply(def.alliance, t)) ?? own : own;
    this.pendingHp.push({ alliance: this.alliance, loader: this.loaderIndex, pin, cup: k === 'cup' || k === 'pair' });
  }

  private hasSupply(a: Alliance, t: PinType): boolean {
    return this.session.sim.state.objects.some((o) => o.loc === 'supply' && o.supply === a && o.pin === t);
  }

  setLoader(i: number): void {
    if (this.ownLoaders().includes(i)) this.loaderIndex = i;
  }

  private playerCommand(): RobotCommand | null {
    const sim = this.session.sim;
    if (this.session.controllers[0] || this.modeId === 'solocode') return null;
    const keys = this.ramp.apply(this.input.readKeys(), this.frameDt);
    return mapDriverInput(this.input.readPad(), keys, this.settings, sim.specs[0].drive.type, sim.state.robots[0].alliance);
  }

  private step(cmd: RobotCommand | null): void {
    this.prev = this.cur;
    const hp = this.pendingHp;
    this.pendingHp = [];
    this.session.tick(cmd, hp);
    this.cur = this.session.sim.poses();
    this.feedback();
  }

  /** Sounds and voice callouts from what just happened in the sim. */
  private feedback(): void {
    const sim = this.session.sim;
    const me = sim.state.robots[0]?.alliance;
    for (const e of sim.events) {
      if (e.type === 'placed' && e.robot === 0) play('place');
      if (e.type === 'load' && e.alliance === me) play(e.ok ? 'load' : 'deny');
      if (e.type === 'possession' && e.robot === 0) play('deny');
    }
    if (sim.calls.length) play('call');
    const phase = sim.phase;
    if (phase !== this.lastPhase) {
      if (phase === 'auton') say('Autonomous');
      else if (phase === 'driver') {
        if (this.lastPhase === 'auton' || this.lastPhase === 'pause') play('start');
        say('Driver control');
      } else if (phase === 'post') {
        play('end');
        say('Match over');
      }
      this.lastPhase = phase;
    }
    if (phase === 'driver') {
      const sec = Math.ceil(sim.remaining - 1e-9);
      if (sec !== this.lastSecond) {
        const t = sim.mode.timing;
        if (t.endgameSec > 0 && sec === t.endgameSec) {
          play('warn');
          say(t.endgameSec >= 30 ? 'Thirty seconds' : 'Endgame');
        } else if (sec === 30 && t.endgameSec !== 30 && t.driverSec > 30) say('Thirty seconds');
        else if (sec <= 3 && sec > 0) play('click');
        this.lastSecond = sec;
      }
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameDt = dt;
    this.input.poll();
    for (const a of this.input.takeActions()) this.handle(a);
    const sim = this.session.sim;
    if (!this.paused && sim.phase !== 'post') {
      const cmd = this.playerCommand();
      const t0 = performance.now();
      this.clock.advance(dt, () => this.step(cmd));
      this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    this.draw(dt);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    const lower = this.autoQ.frame(dt, this.renderer.getQuality());
    if (lower) this.renderer.setQuality(lower);
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

  private draw(dt: number): void {
    const sim = this.session.sim;
    if (this.prev.length !== this.cur.length || this.renderer.objectCount !== sim.state.objects.length) {
      this.renderer.syncObjects(this.worldInfo());
      this.prev = this.cur.slice();
    } else if (this.hudTimer <= 0) this.renderer.syncObjects(this.worldInfo());
    this.renderer.applyPoses(this.prev, this.cur, this.paused ? 1 : this.clock.alpha);
    this.renderer.setGuides(this.settings.guides && sim.phase !== 'post' ? sim.guide(0) : null);
    this.renderer.render(0, dt);
  }

  /** Dev-only: advance the sim deterministically (for automated visual checks when rAF is throttled). */
  debugAdvance(seconds: number, cmd: Partial<RobotCommand> = {}): void {
    const c = { ...NEUTRAL_COMMAND, ...cmd };
    const n = Math.round(seconds * TICK_HZ);
    for (let i = 0; i < n; i++) this.step(c);
    this.prev = this.cur;
    this.draw(1 / 60);
    this.onHud(this.hud());
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
    const slots = effectorSlots(spec).length;
    const store = storageCapacity(spec);
    const rs = this.renderer.stats();
    return {
      phase: sim.phase,
      clock: formatClock(sim.remaining),
      endgame: sim.endgame,
      red: score.red,
      blue: score.blue,
      lines: score.lines,
      camera: CAMERA_LABELS[this.renderer.mode],
      loaderIndex: this.loaderIndex,
      loadKind: this.loadKind,
      supply: { pins: pool.filter((o) => o.kind === 'pin').length, cups: pool.filter((o) => o.kind === 'cup').length },
      toasts: this.settings.messages ? this.session.toasts.filter((x) => sim.state.tick - x.tick < 4 * TICK_HZ) : [],
      holding: names.length ? names.join(' + ') : `Empty · ${slots} grip${slots > 1 ? 's' : ''}${store ? ` + ${store} intake` : ''}`,
      air: needsAir ? me.pneu : null,
      paused: this.paused,
      pad: this.input.padName,
      canLoad: sim.mode.loadPhases.includes(sim.phase),
      anyLoading: sim.mode.loadPhases.length > 0 && this.ownLoaders().length > 0,
      breakdown: this.breakdown,
      perf:
        this.settings.perf === 'off'
          ? null
          : { fps: this.fps, simMs: this.simMs, drawMs: rs.drawMs, calls: rs.calls, triangles: rs.triangles, quality: this.renderer.getQuality() },
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
      stats: { placed: me.stats.placed, loads: me.stats.loads, seconds: sim.state.timer.matchTick / TICK_HZ },
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    const w = window as unknown as { __zdrive?: GameRunner };
    if (w.__zdrive === this) delete w.__zdrive;
  }

  dispose(): void {
    this.stop();
    this.session.dispose();
  }
}
