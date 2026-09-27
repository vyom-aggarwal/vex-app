import { packCmd, quantize, sameCmd, unpackCmd, type PackedCmd, type Replay } from '../shared/replay';
import { TICK_HZ } from '../shared/timestep';
import { NEUTRAL_COMMAND, type HpCommand, type RobotCommand } from '../shared/types';
import { loadPhysics } from './physics';
import { Sim, type SimOptions } from './sim';
import type { EngineEvent, ViolationCall } from './types';

/**
 * A running session: steps the Sim with the player's command, bot commands and human-player loads,
 * records a replay, and keeps Rapier snapshots every 10 s for fast scrubbing (in memory only).
 */

export type Controller = (sim: Sim, index: number) => RobotCommand;

export const SNAPSHOT_TICKS = 10 * TICK_HZ;

export interface Toast {
  id: number;
  tick: number;
  kind: 'call' | 'load' | 'info';
  text: string;
  alliance?: 'red' | 'blue';
}

export class Session {
  readonly sim: Sim;
  readonly opts: SimOptions;
  controllers: (Controller | null)[];
  toasts: Toast[] = [];
  private toastId = 0;
  private cmds: [number, number, PackedCmd][] = [];
  private hp: [number, HpCommand][] = [];
  private last: (PackedCmd | null)[] = [];
  private startTick = -1;
  snapshots = new Map<number, { state: string; world: Uint8Array }>();

  static async create(opts: SimOptions, controllers: (Controller | null)[] = []): Promise<Session> {
    await loadPhysics();
    return new Session(new Sim(opts), opts, controllers);
  }

  constructor(sim: Sim, opts: SimOptions, controllers: (Controller | null)[]) {
    this.sim = sim;
    this.opts = opts;
    this.controllers = controllers;
    this.snapshots.set(0, sim.takeSnapshot());
  }

  start(): boolean {
    const ok = this.sim.start();
    if (ok) this.startTick = this.sim.state.tick;
    return ok;
  }

  /** Step one tick. `player` drives robot 0 unless a controller is set for it. */
  tick(player: RobotCommand | null, hp: HpCommand[] = []): void {
    const sim = this.sim;
    const t = sim.state.tick;
    const cmds = sim.state.robots.map((_, i) => {
      const ctl = this.controllers[i];
      const c = ctl ? ctl(sim, i) : i === 0 && player ? player : NEUTRAL_COMMAND;
      return quantize(c);
    });
    cmds.forEach((c, i) => {
      const p = packCmd(c);
      if (!this.last[i] || !sameCmd(this.last[i]!, p)) {
        this.cmds.push([t, i, p]);
        this.last[i] = p;
      }
    });
    for (const h of hp) this.hp.push([t, h]);
    sim.step({ cmds, hp });
    this.collectToasts(sim.events, sim.calls);
    if (sim.state.tick % SNAPSHOT_TICKS === 0) this.snapshots.set(sim.state.tick, sim.takeSnapshot());
  }

  private collectToasts(events: EngineEvent[], calls: ViolationCall[]): void {
    const tick = this.sim.state.tick;
    for (const c of calls) {
      const lvl = c.level === 'red' ? ' (red card)' : c.level === 'foul' && this.sim.game.escalation ? ' (yellow card)' : c.level === 'warning' ? ' (warning)' : '';
      this.toasts.push({ id: ++this.toastId, tick, kind: 'call', text: `${c.rule}: ${c.text}${lvl}`, alliance: c.alliance });
    }
    for (const e of events) {
      if (e.type === 'load' && !e.ok && e.alliance === this.opts.robots[0]?.alliance)
        this.toasts.push({ id: ++this.toastId, tick, kind: 'load', text: e.reason ?? 'Load refused' });
    }
    if (this.toasts.length > 50) this.toasts.splice(0, this.toasts.length - 50);
  }

  /** Finished replay record. */
  replay(result: Replay['result']): Replay {
    return {
      v: 1,
      game: this.opts.game.id,
      mode: this.opts.modeId,
      seed: this.opts.seed,
      autoRef: this.opts.autoRef ?? true,
      worlds: this.opts.worlds ?? false,
      entries: this.opts.robots,
      ticks: this.sim.state.tick,
      cmds: this.cmds.slice(),
      hp: this.hp.slice(),
      startTick: this.startTick,
      date: new Date().toISOString(),
      result,
    };
  }

  dispose(): void {
    this.sim.dispose();
  }
}

/** Re-simulates a replay. Seeking restores the nearest snapshot at or before the target, then steps. */
export class ReplayPlayer {
  readonly replay: Replay;
  sim: Sim;
  private cmdAt = new Map<number, [number, PackedCmd][]>();
  private hpAt = new Map<number, HpCommand[]>();
  private current: RobotCommand[] = [];
  snapshots = new Map<number, { state: string; world: Uint8Array; cmds: RobotCommand[] }>();

  constructor(replay: Replay, opts: SimOptions) {
    this.replay = replay;
    this.sim = new Sim(opts);
    for (const [t, i, p] of replay.cmds) {
      const list = this.cmdAt.get(t) ?? [];
      list.push([i, p]);
      this.cmdAt.set(t, list);
    }
    for (const [t, h] of replay.hp) {
      const list = this.hpAt.get(t) ?? [];
      list.push(h);
      this.hpAt.set(t, list);
    }
    this.current = this.sim.state.robots.map(() => NEUTRAL_COMMAND);
    this.snap();
  }

  get tick(): number {
    return this.sim.state.tick;
  }

  private snap(): void {
    this.snapshots.set(this.tick, { ...this.sim.takeSnapshot(), cmds: this.current.slice() });
  }

  step(): boolean {
    const t = this.tick;
    if (t >= this.replay.ticks) return false;
    if (t === this.replay.startTick) this.sim.start();
    for (const [i, p] of this.cmdAt.get(t) ?? []) this.current[i] = unpackCmd(p);
    this.sim.step({ cmds: this.current, hp: this.hpAt.get(t) ?? [] });
    if (this.tick % SNAPSHOT_TICKS === 0 && !this.snapshots.has(this.tick)) this.snap();
    return true;
  }

  seek(target: number): void {
    target = Math.max(0, Math.min(this.replay.ticks, target));
    let best = 0;
    for (const k of this.snapshots.keys()) if (k <= target && k > best) best = k;
    if (target < this.tick || best > this.tick) {
      const s = this.snapshots.get(best)!;
      this.sim.restoreSnapshot(s);
      this.current = s.cmds.slice();
    }
    while (this.tick < target && this.step());
  }

  dispose(): void {
    this.sim.dispose();
  }
}
