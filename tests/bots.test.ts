import { makeBot } from '../src/bots';
import { loadPhysics } from '../src/engine/physics';
import { Session } from '../src/engine/session';
import OVERRIDE from '../src/games/override';
import PINNACLE from '../src/games/pinnacle';
import { presetsFor } from '../src/games/presets';
import type { RobotEntry } from '../src/shared/types';
import { ok, test } from './harness';

test('Scorer bot places pieces in Driver Skills', async () => {
  await loadPhysics();
  const spec = presetsFor('override')[0];
  const robots: RobotEntry[] = [{ spec, alliance: 'red', driver: { style: 'scorer', level: 'hard' }, slot: 0 }];
  const s = await Session.create({ game: OVERRIDE, modeId: 'skills', robots, seed: 3 }, [makeBot('scorer', 'hard')]);
  s.start();
  for (let t = 0; t < 60 * 120; t++) s.tick(null);
  const placed = s.sim.state.robots[0].stats.placed;
  console.log(`       scorer placed ${placed}, score ${s.sim.score().red}`);
  ok(placed >= 1, 'placed at least one piece');
});

test('Bots obey rules in a full 2v2 match (no SG9) and never freeze', async () => {
  await loadPhysics();
  const p = presetsFor('override');
  const robots: RobotEntry[] = [
    { spec: p[0], alliance: 'red', driver: { style: 'scorer', level: 'normal' }, slot: 0 },
    { spec: p[4], alliance: 'red', driver: { style: 'controller', level: 'normal' }, slot: 1 },
    { spec: p[1], alliance: 'blue', driver: { style: 'mixed', level: 'hard' }, slot: 0 },
    { spec: p[2], alliance: 'blue', driver: { style: 'defender', level: 'easy' }, slot: 1 },
  ];
  const ctl = robots.map((r) => (typeof r.driver === 'string' ? null : makeBot(r.driver.style, r.driver.level)));
  const s = await Session.create({ game: OVERRIDE, modeId: 'match', robots, seed: 11 }, ctl);
  s.start();
  const moved = robots.map(() => 0);
  for (let t = 0; t < 120 * 120; t++) {
    s.tick(null);
    s.sim.state.robots.forEach((_, i) => {
      const q = s.sim.robotPose(i);
      if (Math.hypot(q.vx, q.vy) > 0.1) moved[i]++;
    });
  }
  const calls = s.sim.state.ref.calls;
  console.log(`       calls: ${calls.map((c) => `${c.rule}#${c.robot}:${c.text.slice(0, 22)}`).join(', ') || 'none'}; score ${s.sim.score().red}-${s.sim.score().blue}`);
  ok(!calls.some((c) => c.rule === 'SG9'), 'no opposing-goal interaction');
  ok(moved.every((m) => m > 120 * 10), `every bot drove for at least 10 s (${moved.map((m) => (m / 120).toFixed(0)).join(', ')})`);
});

test('Pinnacle solo bot runs without errors', async () => {
  await loadPhysics();
  const robots: RobotEntry[] = [{ spec: presetsFor('pinnacle')[5], alliance: 'red', driver: { style: 'mixed', level: 'normal' }, slot: 0 }];
  const s = await Session.create({ game: PINNACLE, modeId: 'solo', robots, seed: 5 }, [makeBot('mixed', 'normal')]);
  s.start();
  for (let t = 0; t < 60 * 120; t++) s.tick(null);
  ok(s.sim.phase === 'post', 'finished');
});
