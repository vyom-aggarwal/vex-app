import { loadPhysics } from '../src/engine/physics';
import { ReplayPlayer, Session } from '../src/engine/session';
import { makeBot } from '../src/bots';
import OVERRIDE from '../src/games/override';
import PINNACLE from '../src/games/pinnacle';
import { presetsFor } from '../src/games/presets';
import { commitRun, loadRecords } from '../src/shared/records';
import { replayFileName } from '../src/shared/replay';
import type { RobotEntry } from '../src/shared/types';
import { DEG } from '../src/shared/units';
import { eq, ok, test } from './harness';
import { cmd, makeSim, run } from './util';

const entries = (game: 'override' | 'pinnacle', n: { red: number; blue: number }): RobotEntry[] => {
  const out: RobotEntry[] = [];
  for (let i = 0; i < n.red; i++) out.push({ spec: presetsFor(game)[i % 3], alliance: 'red', driver: 'player', slot: i });
  for (let i = 0; i < n.blue; i++) out.push({ spec: presetsFor(game)[(i + 1) % 3], alliance: 'blue', driver: 'player', slot: i });
  return out;
};

test('Replay reproduces the run exactly; seeking via snapshots matches', async () => {
  await loadPhysics();
  const opts = { game: OVERRIDE, modeId: 'match1v1' as const, robots: entries('override', { red: 1, blue: 1 }), seed: 7 };
  const weave = (sim: { state: { tick: number } }) => cmd({ fwd: 0.6, turn: Math.sin(sim.state.tick / 90) * 0.5 });
  const s = await Session.create(opts, [null, weave]);
  s.tick(null);
  s.start();
  for (let t = 0; t < 2600; t++) {
    const hp = t === 1900 ? [{ alliance: 'red' as const, loader: 0, pin: 'RY' as const, cup: true }] : [];
    s.tick(cmd({ fwd: Math.sin(t / 40) * 0.9, turn: Math.cos(t / 55) * 0.7, lift: t % 500 < 250 ? 0.5 : -0.5, gripPin: t % 700 === 350 }), hp);
  }
  const final = s.sim.hash();
  const rep = s.replay({ red: 0, blue: 0, player: 0 });
  ok(rep.cmds.length < 2600 * 2, 'commands stored as deltas');
  const p = new ReplayPlayer(rep, opts, [null, weave]);
  while (p.step());
  eq(p.sim.hash(), final, 'replay hash');
  p.seek(700);
  p.seek(rep.ticks);
  eq(p.sim.hash(), final, 'hash after seeking back and forward');
  ok(JSON.stringify(rep).length < 200_000, `compact replay (${JSON.stringify(rep).length} bytes)`);
  eq(replayFileName({ game: 'override', mode: 'skills', date: '2026-09-27T10:11:12.000Z' }), 'zdrive-override-skills-2026-09-27-10-11-12.json');
});

test('SG7 in Autonomous flips the bonus; SG9 is called', async () => {
  const sim = await makeSim(OVERRIDE, 'match1v1', { empty: true });
  sim.start();
  // Red robot drives straight across the diagonal Autonomous Line.
  const r = sim.state.robots[0];
  sim.body(r.body).setTranslation({ x: -10 * 0.0254, y: 5 * 0.0254, z: 0 }, true);
  run(sim, 30, [cmd({ fwd: 1 })]);
  ok(sim.state.ref.calls.some((c) => c.rule === 'SG7' && c.alliance === 'red'), 'SG7 called');
  run(sim, 15 * 120);
  eq(sim.state.auton!.bonus, { red: 0, blue: 12 }, 'bonus to blue');
  const s2 = await makeSim(OVERRIDE, 'match1v1', { empty: true });
  s2.start();
  run(s2, 15 * 120 + 1);
  const g = OVERRIDE.field.goals.find((x) => x.id === 'R1')!; // blue alliance goal
  const r2 = s2.state.robots[0];
  s2.body(r2.body).setTranslation({ x: g.x * 0.0254, y: (g.y + 11.5) * 0.0254, z: 0 }, true);
  s2.body(r2.body).setRotation({ x: 0, y: 0, z: Math.sin((-90 * DEG) / 2), w: Math.cos((-90 * DEG) / 2) }, true);
  run(s2, 60, [cmd({ fwd: 0.4 })]);
  ok(s2.state.ref.calls.some((c) => c.rule === 'SG9'), 'SG9 called');
});

test('Pinnacle 5.3.5 red card zeroes a solo score; auto-ref can be off', async () => {
  const mk = async (autoRef: boolean) => {
    await loadPhysics();
    const { Sim } = await import('../src/engine/sim');
    return new Sim({ game: PINNACLE, modeId: 'solo', robots: entries('pinnacle', { red: 1, blue: 0 }), seed: 1, autoRef });
  };
  const sim = await mk(true);
  sim.start();
  const g = PINNACLE.field.goals.find((x) => x.id === 'B1')!;
  const r = sim.state.robots[0];
  sim.body(r.body).setTranslation({ x: g.x * 0.0254, y: (g.y + 11.5) * 0.0254, z: 0 }, true);
  run(sim, 120, [cmd({ fwd: 0.4 })]);
  ok(sim.state.ref.redCards.includes(0), 'red card');
  run(sim, 60 * 120);
  eq(sim.state.final!.red, 0, 'score zeroed');
  const off = await mk(false);
  off.start();
  off.body(off.state.robots[0].body).setTranslation({ x: g.x * 0.0254, y: (g.y + 11.5) * 0.0254, z: 0 }, true);
  run(off, 120, [cmd({ fwd: 0.4 })]);
  eq(off.state.ref.calls.length, 0, 'no calls with auto-ref off');
});

test('Records: best score and career totals', () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  ok(commitRun({ game: 'override', mode: 'skills', score: 40, outcome: null, seconds: 60, placed: 5, loads: 3, calls: 0 }), 'first best');
  ok(!commitRun({ game: 'override', mode: 'skills', score: 30, outcome: null, seconds: 60, placed: 2, loads: 1, calls: 1 }), 'not a best');
  const r = loadRecords('override');
  eq(r.best.skills!.score, 40);
  eq(r.career.runs, 2);
  eq(r.career.points, 70);
  ok([...mem.keys()].every((k) => k.startsWith('zdrive:')), 'keys use the zdrive: prefix');
});

test('Replay with bots: re-created bots reproduce the run, including after seeking back', async () => {
  await loadPhysics();
  const robots: RobotEntry[] = [
    { spec: presetsFor('override')[0], alliance: 'red', driver: 'player', slot: 0 },
    { spec: presetsFor('override')[1], alliance: 'blue', driver: { style: 'mixed', level: 'hard' }, slot: 0 },
  ];
  const opts = { game: OVERRIDE, modeId: 'match1v1' as const, robots, seed: 21 };
  const bots = () => robots.map((r) => (typeof r.driver === 'string' ? null : makeBot(r.driver.style, r.driver.level)));
  const s = await Session.create(opts, bots());
  s.start();
  for (let t = 0; t < 3000; t++) s.tick(cmd({ fwd: t % 600 < 300 ? 0.8 : -0.8, turn: 0.2 }));
  const final = s.sim.hash();
  const rep = s.replay({ red: 0, blue: 0, player: 0 });
  ok(rep.cmds.every((c) => c[1] === 0), 'only the player is recorded');
  const p = new ReplayPlayer(rep, opts, bots());
  while (p.step());
  eq(p.sim.hash(), final, 'linear playback');
  p.seek(1300);
  p.seek(rep.ticks);
  eq(p.sim.hash(), final, 'after seeking back to a snapshot');
});
