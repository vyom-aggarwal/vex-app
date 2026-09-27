import { derivedStats } from '../src/engine/drivetrain';
import { checkLegality } from '../src/engine/legality';
import OVERRIDE from '../src/games/override';
import { makeSpec, presetsFor } from '../src/games/presets';
import { exportRobot, importRobot } from '../src/shared/robotCodec';
import { mpsToFps } from '../src/shared/units';
import { eq, near, ok, test } from './harness';
import { cmd, makeSim, run } from './util';

test('Override spawn counts per mode', async () => {
  for (const [mode, cups, pins] of [
    ['match', 36, { RB: 4, RY: 8, BY: 8, YY: 17 }],
    ['skills', 36, { RB: 4, RY: 8, BY: 8, YY: 12 }],
  ] as const) {
    const sim = await makeSim(OVERRIDE, mode);
    const field = sim.state.objects.filter((o) => o.loc !== 'supply' && o.loc !== 'held' && o.loc !== 'stored');
    eq(field.filter((o) => o.kind === 'cup').length, cups, `${mode} cups`);
    for (const [t, n] of Object.entries(pins)) eq(field.filter((o) => o.pin === t).length, n, `${mode} ${t}`);
    eq(field.filter((o) => o.onLine).length, 28, `${mode} line objects`);
    sim.dispose();
  }
  const m = await makeSim(OVERRIDE, 'match');
  const sup = m.state.objects.filter((o) => o.loc === 'supply');
  eq(sup.filter((o) => o.kind === 'cup').length, 20, 'match-load cups');
  eq(sup.filter((o) => o.kind === 'pin').length, 22, 'match-load pins');
  eq(m.state.objects.filter((o) => o.loc === 'held' || o.loc === 'stored').length, 4, 'preloads');
  eq(m.state.objects.length, 56 + 63, 'all objects (preloads come out of the 63 pins)');
  const sk = await makeSim(OVERRIDE, 'skills');
  eq(sk.state.objects.filter((o) => o.loc === 'supply').length, 14, 'skills match loads');
});

test('Top speed within 5% of the builder value', async () => {
  for (const spec of presetsFor('override')) {
    const sim = await makeSim(OVERRIDE, 'free', { bare: true, specs: [spec] });
    sim.body(sim.state.robots[0].body).setTranslation({ x: 0, y: 58 * 0.0254, z: 0 }, true);
    let v = 0;
    for (let t = 0; t < 300; t++) {
      sim.step({ cmds: [cmd({ fwd: 1 })], hp: [] });
      const p = sim.robotPose(0);
      if (sim.facts[0].touching.length === 0) v = Math.max(v, mpsToFps(Math.hypot(p.vx, p.vy)));
    }
    const d = derivedStats(spec).topSpeedFps;
    near(v, d, d * 0.05, `${spec.name} top speed`);
    sim.dispose();
  }
});

test('Turn rate with scrub', async () => {
  const base = presetsFor('override')[0];
  const dps = derivedStats(base).turnDps;
  ok(dps >= 300 && dps <= 350, `default tank turn ${dps.toFixed(0)} deg/s should be 300-350`);
  const sim = await makeSim(OVERRIDE, 'free', { bare: true, specs: [base] });
  run(sim, 240, [cmd({ turn: 1 })]);
  const w = (Math.abs(sim.robotPose(0).w) * 180) / Math.PI;
  near(w, dps, dps * 0.06, 'sim turn rate');
  sim.dispose();
  const traction = makeSpec('override', 't', 'Traction', { drive: { ...base.drive, omni: [false, false] } });
  ok(derivedStats(traction).turnDps < dps * 0.9, 'all-traction robot scrubs and turns slower');
});

test('Collisions: wall stops the robot, robot pushes objects', async () => {
  const sim = await makeSim(OVERRIDE, 'free', { empty: true });
  run(sim, 600, [cmd({ fwd: -1 })]); // backs into the red wall
  const p = sim.robotPose(0);
  ok(p.y < 0.0254 * 70.2 && p.y > 1.5, `robot stays in the field (y=${p.y.toFixed(3)})`);
  const s2 = await makeSim(OVERRIDE, 'free', { empty: true });
  const r = s2.robotPose(0);
  const id = s2.addObject('cup', null, { x: r.x, y: r.y - 0.45, z: 0.083 }, { x: 0, y: 0, z: 0, w: 1 });
  const y0 = s2.objPos(id).y;
  run(s2, 120, [cmd({ fwd: 1 })]);
  ok(s2.objPos(id).y < y0 - 0.1, 'cup was pushed');
});

test('Possession limit enforced in the engine', async () => {
  const conveyor = presetsFor('override').find((p) => p.id === 'preset:conveyor')!;
  const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [conveyor] });
  ok(sim.state.robots[0].slots[0] >= 0, 'preload pin held');
  const front = sim.robotPoint(0, conveyor.chassis.length / 2 + 1.5, 0, 3.3);
  const pin = sim.addObject('pin', 'YY', front, { x: 0, y: 0, z: 0, w: 1 });
  let flagged = false;
  for (let t = 0; t < 30; t++) {
    sim.step({ cmds: [cmd({ intake: 1 })], hp: [] });
    if (sim.events.some((e) => e.type === 'possession')) flagged = true;
  }
  eq(sim.obj(pin).loc, 'field', 'second pin refused');
  ok(flagged, 'possession event raised');
  const s3 = await makeSim(OVERRIDE, 'free', { empty: true, specs: [conveyor] });
  const f3 = s3.robotPoint(0, conveyor.chassis.length / 2 + 1.5, 0, 3.3);
  const c = s3.addObject('cup', null, f3, { x: 0, y: 0, z: 0, w: 1 });
  run(s3, 30, [cmd({ intake: 1 })]);
  eq(s3.obj(c).loc, 'stored', 'a cup is still allowed');
});

test('Loader rules (Override match)', async () => {
  const sim = await makeSim(OVERRIDE, 'match1v1');
  sim.start();
  const hp = { alliance: 'red' as const, loader: 0, pin: 'RY' as const, cup: false };
  eq(sim.humanLoad(hp).ok, false, 'no loads in Autonomous');
  run(sim, 15 * 120 + 1);
  eq(sim.phase, 'driver');
  eq(sim.humanLoad({ ...hp, loader: 2 }).ok, false, 'not your loader');
  eq(sim.humanLoad(hp).ok, true, 'own loader in driver');
  eq(sim.humanLoad(hp).ok, false, '1 s delay');
  run(sim, 121);
  eq(sim.humanLoad({ ...hp, pin: 'YY', cup: true }).ok, true, 'nested pair');
  run(sim, 121);
  eq(sim.humanLoad({ ...hp, pin: 'BY' }).ok, false, 'red supply has no blue pins');
  run(sim, 5);
  ok(sim.state.loaders[0].presented >= 0, 'first load presented at the loader exit');
});

test('Match phase timings', async () => {
  const sim = await makeSim(OVERRIDE, 'match1v1', { empty: true });
  eq(sim.phase, 'pre');
  sim.start();
  eq(sim.phase, 'auton');
  run(sim, 1799);
  eq(sim.phase, 'auton');
  run(sim, 1);
  eq(sim.phase, 'driver');
  ok(sim.state.auton !== null, 'autonomous evaluated');
  run(sim, 105 * 120 - 10 * 120 - 1);
  ok(!sim.endgame, 'not yet endgame');
  run(sim, 2);
  ok(sim.endgame, 'endgame in the final 10 s');
  run(sim, 10 * 120);
  eq(sim.phase, 'post');
  ok(sim.state.final !== null, 'final score recorded');
  const sk = await makeSim(OVERRIDE, 'skills', { empty: true });
  sk.start();
  eq(sk.phase, 'driver');
  run(sk, 60 * 120);
  eq(sk.phase, 'post');
});

test('Determinism: same seed + commands gives the same hash after 3000 ticks', async () => {
  const script = (t: number) => [
    cmd({ fwd: Math.sin(t / 50), turn: Math.cos(t / 70) * 0.6, lift: t % 400 < 200 ? 1 : -1, gripPin: t % 300 === 0, intake: 1 }),
    cmd({ fwd: 1, turn: 0.3 }),
    cmd({ fwd: -0.5, turn: -0.2 }),
    cmd({ fwd: 0.8 }),
  ];
  const hashes: string[] = [];
  for (let k = 0; k < 2; k++) {
    const sim = await makeSim(OVERRIDE, 'match', { seed: 42 });
    sim.start();
    run(sim, 3000, script);
    hashes.push(sim.hash());
    sim.dispose();
  }
  eq(hashes[0], hashes[1]);
});

test('Builder legality against Override caps', () => {
  for (const p of presetsFor('override')) {
    const l = checkLegality(p, OVERRIDE.builder, OVERRIDE.possession);
    ok(l.ok, `${p.name} legal: ${l.errors.join('; ')}`);
  }
  const base = presetsFor('override')[0];
  const big = makeSpec('override', 'x', 'Big drive', { drive: { ...base.drive, motorsPerSide: [11, 11, 11] } });
  const l = checkLegality(big, OVERRIDE.builder, OVERRIDE.possession);
  ok(!l.ok && l.errors.some((e) => e.includes('Drivetrain')), '66 W drive exceeds 55 W');
  const tall = makeSpec('override', 'x', 'Tall', { lift: { type: 'cascade', maxHeight: 60, motors: [11] } });
  ok(!checkLegality(tall, OVERRIDE.builder, OVERRIDE.possession).ok, 'over 50 in is illegal');
  const hog = makeSpec('override', 'x', 'Hog', {
    lift: { type: 'dr4b', maxHeight: 20, motors: [11, 11, 11, 11] },
    intake: { type: 'conveyor', mount: 'front', upright: true, lying: true, motors: [11, 11] },
  });
  const lh = checkLegality(hog, OVERRIDE.builder, OVERRIDE.possession);
  ok(lh.totalW > 88 && !lh.ok, 'over 88 W total is illegal');
  const stack = presetsFor('pinnacle').find((p) => p.effector.type === 'stack')!;
  ok(!checkLegality({ ...stack, game: 'override' }, OVERRIDE.builder, OVERRIDE.possession).ok, 'no stack gripper in Override');
});

test('Robot export/import round-trip', () => {
  const s = presetsFor('override')[2];
  const str = exportRobot(s);
  ok(str.startsWith('ZDRIVE1:'));
  const back = importRobot(str);
  ok(back.ok);
  eq(back.ok && back.spec, s);
  eq(importRobot(str.slice(8)).ok, false, 'rejects missing prefix');
  eq(importRobot('{"v":1}').ok, false, 'rejects raw JSON');
  eq(importRobot('ZDRIVE1:@@@').ok, false, 'rejects garbage');
});

test('Robots never leave the tiles and pieces never get launched', async () => {
  const PIN = (await import('../src/games/pinnacle')).PINNACLE;
  for (const game of [OVERRIDE, PIN]) {
    for (const spec of presetsFor(game.id)) {
      const sim = await makeSim(game, 'free', { specs: [spec] });
      let zMax = 0;
      let vObj = 0;
      for (let t = 0; t < 120 * 12; t++) {
        sim.step({ cmds: [cmd({ fwd: Math.sin(t / 150) > -0.3 ? 1 : -1, turn: Math.sin(t / 97) * 0.6, lift: t % 900 < 300 ? 1 : t % 900 < 600 ? -1 : 0, intake: 1 })], hp: [] });
        zMax = Math.max(zMax, Math.abs(sim.body(sim.state.robots[0].body).translation().z));
        for (const o of sim.state.objects) {
          if (o.loc !== 'field') continue;
          const v = sim.body(o.body).linvel();
          vObj = Math.max(vObj, Math.hypot(v.x, v.y, v.z));
        }
      }
      ok(zMax < 1e-6, `${game.id} ${spec.name}: chassis left the tiles by ${zMax} m`);
      ok(vObj < 4, `${game.id} ${spec.name}: a piece reached ${vObj.toFixed(1)} m/s`);
      sim.dispose();
    }
  }
});
