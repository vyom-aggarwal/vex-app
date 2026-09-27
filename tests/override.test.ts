import { effectorPoint } from '../src/engine/mechanism';
import { cupLevel, pinLevel } from '../src/engine/stacks';
import type { AutonResult, GoalStack, RobotScoreFacts, ScoreInput, StackLevel, ViolationCall } from '../src/engine/types';
import OVERRIDE from '../src/games/override';
import { overrideAuton, scoreOverride } from '../src/games/override/scoring';
import { matchLayout } from '../src/games/override/field';
import { presetsFor } from '../src/games/presets';
import type { HalfColor, ModeId, PinType } from '../src/shared/types';
import { DEG } from '../src/shared/units';
import { eq, ok, test } from './harness';
import { cmd, makeSim, run } from './util';

let nextId = 1000;
const pin = (t: PinType, down: 0 | 1): StackLevel => pinLevel({ id: nextId++, pin: t, down });
const cup = (down: 'clear' | 'opaque'): StackLevel => cupLevel(nextId++, down);

function input(stacks: Record<string, StackLevel[]>, o: Partial<ScoreInput> = {}, mode: ModeId = 'match'): ScoreInput {
  const all: GoalStack[] = OVERRIDE.field.goals.map((g) => ({ goalId: g.id, levels: stacks[g.id] ?? [] }));
  const detents: Record<string, HalfColor | null> = { T_L: 'yellow', T_A: 'yellow', T_F: 'yellow', T_R: 'yellow' };
  return { mode, stacks: all, detents, detentTouched: {}, robots: [], auton: null, redCards: [], ...o };
}
const robot = (alliance: 'red' | 'blue', inMidfield = false, touchingPerimeter = false): RobotScoreFacts => ({ alliance, inMidfield, touchingPerimeter, loaders: [] });
const pts = (i: ScoreInput, mode: ModeId = 'match') => {
  const s = scoreOverride(i, mode);
  return [s.red, s.blue];
};

test('Cup orientation: which pin halves stay visible', () => {
  // RB pin: half 0 red, half 1 blue. down = 0 → red half in the goal (visible), blue half up.
  eq(pts(input({ L1: [pin('RB', 0)] })), [5, 5], 'bare pin: both halves');
  eq(pts(input({ L1: [pin('RB', 0), cup('clear')] })), [5, 5], 'clear half down: blue half visible');
  eq(pts(input({ L1: [pin('RB', 0), cup('opaque')] })), [5, 0], 'opaque half down hides the blue half');
  // Pin on top of the cup sits in the cup's upper half.
  eq(pts(input({ L1: [pin('RB', 0), cup('clear'), pin('RB', 1)] })), [10, 5], 'upper half opaque hides the top pin lower (blue) half');
  eq(pts(input({ L1: [pin('RB', 0), cup('opaque'), pin('RB', 1)] })), [10, 5], 'upper half clear shows it; lower blue hidden instead');
  eq(pts(input({ L1: [cup('clear'), pin('RB', 0)] })), [0, 0], 'cup alone on a goal is not Placed, so nothing above is');
});

test('SC2: one pin half per Goal / Cup half', () => {
  const crowded: StackLevel = { kind: 'pins', pins: [{ id: 1, pin: 'RB', down: 0 }, { id: 2, pin: 'RB', down: 1 }] };
  eq(pts(input({ L1: [crowded] })), [0, 0], 'two pins in one goal: neither Placed');
  eq(pts(input({ L1: [crowded, cup('clear'), pin('RB', 0)] })), [0, 0], 'nothing above a crowded level is Placed');
  const ok1 = input({ L1: [pin('RB', 0), cup('clear'), crowded] });
  eq(pts(ok1), [5, 5], 'crowded top level only voids the crowded pins');
});

test('SC4 toggle states, including robot contact', () => {
  const st = { L2: [pin('YY', 0)] }; // neutral goal in red quadrant L; 2 yellow halves
  eq(pts(input(st)), [0, 0], 'yellow toggle: no owner');
  eq(pts(input(st, { detents: { T_L: 'red' } })), [20, 0], 'red toggle: red owns');
  eq(pts(input(st, { detents: { T_L: 'blue' } })), [0, 20], 'blue toggle: blue owns');
  eq(pts(input(st, { detents: { T_L: 'red' }, detentTouched: { T_L: true } })), [0, 0], 'touched toggle counts as yellow');
  eq(pts(input(st, { detents: { T_L: null } })), [0, 0], 'unseated toggle counts as yellow');
});

test('SC5/SC6 Midfield ownership and ties', () => {
  const st = { G0: [pin('YY', 0)] };
  eq(pts(input(st, { robots: [robot('red', true), robot('red', true), robot('blue', true)] })), [20 + 16, 8], '2 v 1 in the Midfield');
  eq(pts(input(st, { robots: [robot('red', true), robot('blue', true)] })), [8, 8], 'tie: nobody owns the yellow');
  eq(pts(input(st, { robots: [robot('red'), robot('blue')] })), [0, 0], 'nobody in the Midfield');
});

test('SC7 Autonomous Bonus: winner, tie, violations, Midfield excluded', () => {
  const none: ViolationCall[] = [];
  const v = (a: 'red' | 'blue'): ViolationCall => ({ rule: 'SG7', robot: 0, alliance: a, level: 'foul', text: '', tick: 1, auton: true });
  const lead = input({ L1: [pin('RY', 1)] }); // red half up → red 5, yellow in L → no owner
  eq(overrideAuton(lead, none).bonus, { red: 12, blue: 0 }, 'higher score wins');
  eq(overrideAuton(input({}), none).bonus, { red: 6, blue: 6 }, 'tie splits');
  eq(overrideAuton(lead, [v('red')]).bonus, { red: 0, blue: 12 }, 'red violation gives it to blue');
  eq(overrideAuton(lead, [v('red'), v('blue')]).bonus, { red: 0, blue: 0 }, 'both violate: nobody');
  const mid = input({ G0: [pin('YY', 0)] }, { robots: [robot('blue', true)] });
  eq(overrideAuton(mid, none).bonus, { red: 6, blue: 6 }, 'Midfield-dependent points excluded');
  const withBonus = input({ L1: [pin('RY', 1)] }, { auton: overrideAuton(lead, none) });
  eq(pts(withBonus), [5 + 12, 0], 'bonus added to the final score');
});

test('SC8 Autonomous Win Point: standard and Worlds', () => {
  const tower = (): StackLevel[] => [pin('RY', 1), cup('clear'), pin('RY', 1), cup('clear'), pin('RY', 1)];
  const six = { L1: tower(), A1: tower() };
  const res = (i: ScoreInput, calls: ViolationCall[] = []): AutonResult => overrideAuton(i, calls);
  eq(res(input(six, { robots: [robot('red'), robot('red')] })).awp.red, true, '6 pins over 2 goals');
  eq(res(input(six, { robots: [robot('red')], worlds: true })).awp.red, false, 'Worlds needs 7 pins / 3 goals');
  const seven = { L1: tower(), A1: tower(), L2: [pin('RY', 1), cup('clear'), pin('RY', 1)] };
  eq(res(input(seven, { robots: [robot('red')], worlds: true })).awp.red, true, 'Worlds: 8 pins over 3 goals');
  eq(res(input({ L1: tower(), F2: tower() }, { robots: [robot('red')] })).awp.red, false, 'goals across the line do not count');
  eq(res(input(six, { robots: [robot('red', false, true)] })).awp.red, false, 'touching the perimeter');
  const v: ViolationCall = { rule: 'SG7', robot: 0, alliance: 'red', level: 'foul', text: '', tick: 1, auton: true };
  eq(res(input(six, { robots: [robot('red')] }), [v]).awp.red, false, 'autonomous violation');
});

test('Skills scoring differences', () => {
  const sk = (st: Record<string, StackLevel[]>, o: Partial<ScoreInput> = {}) => pts(input(st, o, 'skills'), 'skills')[0];
  eq(sk({ F2: [pin('RB', 0)] }), 5, 'red half in a blue quadrant scores nothing; blue half scores');
  eq(sk({ L1: [pin('RB', 0)] }), 5, 'blue half in a red quadrant scores nothing');
  eq(sk({ G0: [pin('RB', 0)] }), 10, 'both halves count in the Midfield');
  eq(sk({ L2: [pin('YY', 0)] }, { detents: { T_L: 'red' } }), 20, 'yellow owned when the toggle shows the quadrant color');
  eq(sk({ L2: [pin('YY', 0)] }, { detents: { T_L: 'blue' } }), 0, 'wrong-color toggle grants nothing');
  eq(sk({ G0: [pin('YY', 0)] }, { robots: [robot('red', true)] }), 28, 'Midfield yellow owned + 8 for the robot');
  eq(sk({ G0: [pin('YY', 0)] }, { robots: [robot('red')] }), 0, 'no robot in the Midfield');
});

test('Grasp and nest: release over a goal places the pin', async () => {
  const spec = presetsFor('override')[0];
  const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [spec] });
  const r = sim.state.robots[0];
  const held = r.slots[0];
  ok(held >= 0, 'holding the preload');
  r.lift = 0.45;
  const e = effectorPoint(spec, r.lift);
  const g = OVERRIDE.field.goals.find((x) => x.id === 'L1')!;
  // Face -y and put the effector point right over the goal.
  const b = sim.body(r.body);
  b.setTranslation({ x: g.x * 0.0254, y: (g.y + e.x) * 0.0254, z: 0 }, true);
  run(sim, 5);
  run(sim, 2, [cmd({ gripPin: true })]);
  eq(sim.obj(held).loc, 'goal', 'pin nested');
  const st = sim.state.stacks.find((s) => s.goalId === 'L1')!;
  eq(st.levels.length, 1);
  ok(sim.events.some((ev) => ev.type === 'placed') || sim.score().red > 0, 'placed');
  ok(sim.score().red >= 5, `red scores (${sim.score().red})`);
});

test('Stack breaks when a robot rams it', async () => {
  const sim = await makeSim(OVERRIDE, 'match1v1', { patch: { layout: matchLayout(true).filter((s) => s.nestIn) } });
  sim.start();
  // Goal R2 (neutral, blue quadrant) starts with a yellow pin. Drive the blue robot's claw into it.
  const g = OVERRIDE.field.goals.find((x) => x.id === 'R2')!;
  const r = sim.state.robots[1];
  sim.body(r.body).setTranslation({ x: (g.x - 22) * 0.0254, y: g.y * 0.0254, z: 0 }, true);
  sim.body(r.body).setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  let removed = false;
  for (let t = 0; t < 240 && !removed; t++) {
    sim.step({ cmds: [cmd({}), cmd({ fwd: 1 })], hp: [] });
    removed = sim.events.some((e) => e.type === 'removed' && e.goalId === 'R2');
  }
  ok(removed, 'stack knocked off');
  ok(sim.state.stacks.find((s) => s.goalId === 'R2')!.levels.length === 0, 'goal emptied');
  run(sim, 5);
  ok(sim.state.ref.calls.some((c) => c.rule === 'SG10' || c.rule === 'SG7'), 'called (SG10, or SG7 in Autonomous)');
});

test('Toggle tool sets a toggle and SC4 reads it once released', async () => {
  const spec = presetsFor('override').find((p) => p.id === 'preset:dr4b')!; // arm wedge
  const sim = await makeSim(OVERRIDE, 'free', { empty: true, specs: [spec] });
  const r = sim.state.robots[0];
  // Face the red wall (+y) just in front of toggle T_L.
  sim.body(r.body).setTranslation({ x: 0, y: (70.2 - spec.chassis.length / 2 - 2.5) * 0.0254, z: 0 }, true);
  sim.body(r.body).setRotation({ x: 0, y: 0, z: Math.sin((90 * DEG) / 2), w: Math.cos((90 * DEG) / 2) }, true);
  run(sim, 5);
  eq(sim.detentState('T_L').color, 'yellow', 'starts yellow');
  run(sim, 2, [cmd({ tool: true })]);
  run(sim, 240);
  eq(sim.detentState('T_L').color, 'red', 'toggle now red');
  const inp = sim.scoreInput();
  eq(inp.detentTouched.T_L, false, 'released');
});
