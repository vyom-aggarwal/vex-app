import { loadPhysics } from '../src/engine/physics';
import { Sim } from '../src/engine/sim';
import type { GameDefinition, ModeDef } from '../src/engine/types';
import { presetsFor } from '../src/games/presets';
import { NEUTRAL_COMMAND, type Alliance, type ModeId, type RobotCommand, type RobotEntry, type RobotSpec } from '../src/shared/types';

export async function makeSim(
  game: GameDefinition,
  modeId: ModeId,
  opts: { specs?: RobotSpec[]; empty?: boolean; bare?: boolean; seed?: number; alliances?: Alliance[]; patch?: Partial<ModeDef> } = {},
): Promise<Sim> {
  await loadPhysics();
  let g = game;
  if (opts.empty || opts.patch) {
    g = { ...game, modes: game.modes.map((m) => (m.id === modeId ? { ...m, ...(opts.empty ? { layout: [] } : {}), ...opts.patch } : m)) };
  }
  if (opts.bare) g = { ...g, field: { ...g.field, goals: [], detents: [], loaders: [] }, modes: g.modes.map((m) => ({ ...m, layout: [] })) };
  const mode = g.modes.find((m) => m.id === modeId)!;
  const alliances: Alliance[] = opts.alliances ?? [...Array(mode.robots.red).fill('red'), ...Array(mode.robots.blue).fill('blue')];
  const counts = { red: 0, blue: 0 };
  const robots: RobotEntry[] = alliances.map((a, i) => ({
    spec: opts.specs?.[i] ?? presetsFor(game.id)[0],
    alliance: a,
    driver: 'player',
    slot: counts[a]++,
  }));
  return new Sim({ game: g, modeId, robots, seed: opts.seed ?? 1 });
}

export const cmd = (c: Partial<RobotCommand>): RobotCommand => ({ ...NEUTRAL_COMMAND, ...c });

export function run(sim: Sim, ticks: number, cmds: RobotCommand[] | ((t: number) => RobotCommand[]) = []): void {
  for (let t = 0; t < ticks; t++) sim.step({ cmds: typeof cmds === 'function' ? cmds(t) : cmds, hp: [] });
}
