import OVERRIDE from '../src/games/override';
import PINNACLE from '../src/games/pinnacle';
import { presetsFor } from '../src/games/presets';
import { ASSIST } from '../src/shared/types';
import { eq, ok, test } from './harness';
import { cmd, makeSim } from './util';

const ASSISTS = ASSIST.align | ASSIST.autoPlace | ASSIST.autoLift;
const IN = 0.0254;

/** Human-like approach: steer the robot center at the target, drive in, then hold align near it. */
function approach(sim: Awaited<ReturnType<typeof makeSim>>, tx: number, ty: number, done: () => boolean, maxSec = 8, press?: () => boolean): number {
  for (let t = 0; t < maxSec * 120; t++) {
    const p = sim.robotPose(0);
    const dx = tx * IN - p.x;
    const dy = ty * IN - p.y;
    const dist = Math.hypot(dx, dy) / IN;
    const err = Math.atan2(Math.sin(Math.atan2(dy, dx) - p.th), Math.cos(Math.atan2(dy, dx) - p.th));
    const near = dist < 20;
    const c = near
      ? cmd({ align: true, assists: ASSISTS })
      : cmd({ fwd: Math.abs(err) < 0.4 ? 0.8 : 0, turn: Math.max(-0.7, Math.min(0.7, -err * 2)), assists: ASSISTS });
    if (press && near) c.gripPin = press();
    sim.step({ cmds: [c], hp: [] });
    if (done()) return t / 120;
  }
  return Infinity;
}

/** After scoring, sit still for a second: the piece must stay nested. */
function settle(sim: Awaited<ReturnType<typeof makeSim>>, goalId: string): boolean {
  for (let t = 0; t < 120; t++) sim.step({ cmds: [cmd({})], hp: [] });
  return sim.state.stacks.find((s) => s.goalId === goalId)!.levels.length > 0;
}

test('A driver can score the preload with the default assists (every Override preset)', async () => {
  for (const spec of presetsFor('override').filter((p) => p.lift.type !== 'none')) {
    const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [spec] });
    const g = OVERRIDE.field.goals.find((x) => x.id === 'L1')!;
    const secs = approach(sim, g.x + 2, g.y, () => sim.state.stacks.find((s) => s.goalId === 'L1')!.levels.length > 0);
    console.log(`       ${spec.name}: scored after ${secs.toFixed(2)} s`);
    ok(Number.isFinite(secs), `${spec.name}: preload never nested`);
    ok(settle(sim, 'L1'), `${spec.name}: stayed scored`);
    eq(sim.score().red >= 5, true, `${spec.name}: scored`);
  }
});

test('A driver can score on the tall center goal from across the field', async () => {
  for (const spec of presetsFor('override').filter((p) => p.lift.type !== 'none')) {
    const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [spec] });
    // Clear line across the Midfield: 40" out, facing the center goal.
    const b = sim.body(sim.state.robots[0].body);
    b.setTranslation({ x: -40 * IN, y: 0, z: 0 }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    const secs = approach(sim, 0, 0, () => sim.state.stacks.find((s) => s.goalId === 'G0')!.levels.length > 0, 10);
    console.log(`       ${spec.name}: center goal after ${secs.toFixed(2)} s`);
    ok(Number.isFinite(secs), `${spec.name}: never nested on the center goal`);
    ok(settle(sim, 'G0'), `${spec.name}: stayed on the center goal`);
  }
});

test('A driver can score in Pinnacle with the stack carrier', async () => {
  const spec = presetsFor('pinnacle').find((p) => p.effector.type === 'stack')!;
  const sim = await makeSim(PINNACLE, 'free', { empty: true, specs: [spec] });
  const g = PINNACLE.field.goals.find((x) => x.id === 'R1')!;
  const secs = approach(sim, g.x, g.y - 2, () => sim.state.stacks.find((s) => s.goalId === 'R1')!.levels.length > 0);
  console.log(`       stack carrier: ${secs.toFixed(2)} s`);
  ok(Number.isFinite(secs), 'preload nested');
});

test('A claw can grab a lying Pin by driving up and pressing grip', async () => {
  const spec = presetsFor('override')[0];
  const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [spec], patch: { preload: {} } });
  const p = sim.robotPose(0);
  const tx = p.x / IN + Math.cos(p.th) * 30;
  const ty = p.y / IN + Math.sin(p.th) * 30;
  const pin = sim.addObject('pin', 'RY', { x: tx * IN, y: ty * IN, z: 1.6 * IN }, { x: 0.7071, y: 0, z: 0, w: 0.7071 });
  let n = 0;
  const secs = approach(sim, tx, ty, () => sim.obj(pin).loc === 'held', 8, () => n++ % 30 === 0 && sim.guide(0).grab !== null);
  console.log(`       grabbed after ${secs.toFixed(2)} s`);
  ok(Number.isFinite(secs), 'lying pin grabbed');
});
