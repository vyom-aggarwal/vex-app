import type { GameId, HpCommand, ModeId, RobotCommand, RobotEntry } from './types';

/**
 * Replay format: seed + robot entries + per-tick inputs, stored as deltas (a robot's command is written
 * only on ticks where it changes). Commands are quantized before they reach the sim, so a replay
 * reproduces the run exactly.
 */

export interface Replay {
  v: 1;
  game: GameId;
  mode: ModeId;
  seed: number;
  autoRef: boolean;
  worlds: boolean;
  entries: RobotEntry[];
  ticks: number;
  /** [tick, robot, packed command] */
  cmds: [number, number, PackedCmd][];
  hp: [number, HpCommand][];
  /** Tick of match start (sim.start()). */
  startTick: number;
  date: string;
  result: { red: number; blue: number; player: number };
}

export type PackedCmd = [number, number, number, number | null, number | null, number, number, number, number];

const q = (v: number): number => Math.round(v * 1000) / 1000;

export function quantize(c: RobotCommand): RobotCommand {
  return {
    ...c,
    fwd: q(c.fwd),
    strafe: q(c.strafe),
    turn: q(c.turn),
    field: c.field ? { x: q(c.field.x), y: q(c.field.y) } : null,
    lift: q(c.lift),
    intake: q(c.intake),
  };
}

export function packCmd(c: RobotCommand): PackedCmd {
  const b = (c.gripPin ? 1 : 0) | (c.gripCup ? 2 : 0) | (c.wrist ? 4 : 0) | (c.tool ? 8 : 0) | (c.align ? 16 : 0);
  return [c.fwd, c.strafe, c.turn, c.field ? c.field.x : null, c.field ? c.field.y : null, c.lift, c.intake, b, c.assists];
}

export function unpackCmd(p: PackedCmd): RobotCommand {
  const [fwd, strafe, turn, fx, fy, lift, intake, b, assists] = p;
  return {
    fwd,
    strafe,
    turn,
    field: fx === null || fy === null ? null : { x: fx, y: fy },
    lift,
    intake,
    gripPin: (b & 1) !== 0,
    gripCup: (b & 2) !== 0,
    wrist: (b & 4) !== 0,
    tool: (b & 8) !== 0,
    align: (b & 16) !== 0,
    assists,
  };
}

export const sameCmd = (a: PackedCmd, b: PackedCmd): boolean => a.every((v, i) => v === b[i]);

export function replayFileName(r: Pick<Replay, 'game' | 'mode' | 'date'>): string {
  const d = r.date.slice(0, 19).replace(/[:T]/g, '-');
  return `zdrive-${r.game}-${r.mode}-${d}.json`;
}
