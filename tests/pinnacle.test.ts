import { cupLevel, pinLevel } from '../src/engine/stacks';
import type { GoalStack, RobotScoreFacts, ScoreInput, StackLevel } from '../src/engine/types';
import PINNACLE from '../src/games/pinnacle';
import { allianceGoalPoints, autonRP, endgameRP, parkedCount, rankingPoints, scorePinnacle, soloGoalPoints } from '../src/games/pinnacle/scoring';
import type { HalfColor, ModeId } from '../src/shared/types';
import { eq, ok, test } from './harness';
import { makeSim, run } from './util';

type K = 'alliance' | 'neutral' | 'center';
const T = (kind: K, owner: 'red' | 'blue' | null, cups: number, red: number, blue: number, yellow: number) => ({ kind, owner, cups, red, blue, yellow });
const solo = (t: ReturnType<typeof T>, roller: HalfColor) => soloGoalPoints(t, roller);
const ally = (t: ReturnType<typeof T>, roller: HalfColor) => {
  const p = allianceGoalPoints(t, roller);
  return [p.red, p.blue];
};

test('Solo examples (1)-(5)', () => {
  eq(solo(T('alliance', 'blue', 6, 2, 3, 2), 'red'), 21, '(1) roller red');
  eq(solo(T('alliance', 'blue', 6, 2, 3, 2), 'yellow'), 21, '(1) roller yellow');
  eq(solo(T('alliance', 'blue', 6, 0, 3, 3), 'blue'), 36, '(2)');
  eq(solo(T('neutral', null, 4, 2, 1, 2), 'yellow'), 19, '(3)');
  eq(solo(T('neutral', null, 4, 2, 1, 2), 'red'), 29, '(4)');
  eq(solo(T('center', null, 5, 2, 2, 2), 'yellow'), 65, '(5)');
});

test('Alliance examples F1-F7', () => {
  eq(ally(T('alliance', 'blue', 6, 2, 3, 2), 'yellow'), [0, 21], 'F1');
  eq(ally(T('alliance', 'blue', 6, 0, 3, 3), 'blue'), [0, 36], 'F2');
  eq(ally(T('alliance', 'blue', 6, 0, 3, 3), 'red'), [15, 21], 'F3');
  eq(ally(T('neutral', null, 4, 2, 1, 2), 'yellow'), [10, 5], 'F4');
  eq(ally(T('neutral', null, 4, 2, 1, 2), 'red'), [24, 5], 'F5');
  eq(ally(T('center', null, 5, 2, 1, 3), 'yellow'), [55, 10], 'F6');
  eq(ally(T('center', null, 4, 2, 2, 2), 'yellow'), [20, 20], 'F7');
});

let nid = 1;
const P = (pin: 'RB' | 'RY' | 'BY' | 'YY', down: 0 | 1): StackLevel => pinLevel({ id: nid++, pin, down });
const C = (down: 'clear' | 'opaque'): StackLevel => cupLevel(nid++, down);
const robot = (alliance: 'red' | 'blue', loaders: string[] = []): RobotScoreFacts => ({ alliance, inMidfield: false, touchingPerimeter: false, loaders });
function input(stacks: Record<string, StackLevel[]>, o: Partial<ScoreInput> = {}, mode: ModeId = 'alliance'): ScoreInput {
  const all: GoalStack[] = PINNACLE.field.goals.map((g) => ({ goalId: g.id, levels: stacks[g.id] ?? [] }));
  const detents: Record<string, HalfColor | null> = { RO_R: 'yellow', RO_B: 'yellow', RO_N1: 'yellow', RO_N2: 'yellow' };
  return { mode, stacks: all, detents, detentTouched: {}, robots: [], auton: null, redCards: [], ...o };
}

test('End-to-end stack: center goal with 5 cups and 6 visible halfpins', () => {
  const st = [P('RB', 0), C('clear'), P('YY', 0), C('clear'), P('RB', 0), C('clear'), P('YY', 0), C('clear'), P('RB', 0), C('clear')];
  eq(scorePinnacle(input({ C: st }, {}, 'solo'), 'solo').red, 65, 'solo');
  const s = scorePinnacle(input({ C: st }), 'alliance');
  ok(s.red > 0 && s.blue > 0, 'alliance splits colored halves');
  eq(scorePinnacle(input({ C: st }, { redCards: [0] }, 'solo'), 'solo').red, 0, 'red card zeroes a solo score');
});

test('Parking: 21 per robot, one robot per Loader', () => {
  const own = ['LR1', 'LR2'];
  eq(parkedCount(input({}, { robots: [robot('red', ['LR1']), robot('red', ['LR1'])] }), 'red', own), 1, 'same loader counts once');
  eq(parkedCount(input({}, { robots: [robot('red', ['LR1']), robot('red', ['LR2'])] }), 'red', own), 2, 'two loaders');
  eq(parkedCount(input({}, { robots: [robot('red', ['LR1', 'LR2']), robot('red', ['LR1'])] }), 'red', own), 2, 'matching finds the best assignment');
  eq(parkedCount(input({}, { robots: [robot('red', ['LB1'])] }), 'red', own), 0, "opponent's loader doesn't count");
  eq(scorePinnacle(input({}, { robots: [robot('red', ['LR1']), robot('blue', ['LB2'])] }), 'alliance').red, 21);
});

test('Ranking points: Autonomous RP and Endgame RP', () => {
  // R1: 2 cups; visible: yellow (in goal), red, red (the middle yellow is hidden by the opaque upper half).
  const two = { R1: [P('RY', 1), C('clear'), P('RY', 1), C('clear')], R2: [P('RB', 1)] };
  const base = input(two, { detents: { RO_R: 'red', RO_B: 'yellow', RO_N1: 'yellow', RO_N2: 'yellow' } });
  ok(!autonRP(base, 'red'), 'only 2 cups');
  const more = input({ ...two, R2: [P('RB', 1), C('clear'), P('RY', 0), C('clear')] }, { detents: base.detents });
  ok(autonRP(more, 'red'), '3+ cups, 4+ halfpins, 2 goals, own roller');
  ok(!autonRP({ ...more, detents: { ...more.detents, RO_R: 'yellow' } }, 'red'), 'needs own zone roller');
  const tower = [P('RY', 1), C('clear'), P('RB', 1), C('clear'), P('RY', 1), C('clear'), P('RB', 1), C('clear'), P('RY', 1), C('clear')];
  const eg = input({ R1: tower }, { detents: { RO_R: 'yellow', RO_B: 'yellow', RO_N1: 'red', RO_N2: 'yellow' }, robots: [robot('red', ['LR2'])] });
  ok(endgameRP(eg, 'red'), 'stack with 5 visible red halfpins + roller + loader');
  ok(!endgameRP({ ...eg, robots: [robot('red')] }, 'red'), 'needs a robot on a loader');
  const res = scorePinnacle(eg, 'alliance');
  eq(rankingPoints(res, 'red'), 2 + 1, 'win + endgame RP');
});

test('Pinnacle spawn counts', async () => {
  for (const mode of ['alliance', 'solo'] as const) {
    const sim = await makeSim(PINNACLE, mode);
    const field = sim.state.objects.filter((o) => o.loc !== 'supply' && o.loc !== 'held' && o.loc !== 'stored');
    eq(field.filter((o) => o.kind === 'cup').length, 16, `${mode} cups`);
    for (const [t, n] of Object.entries({ RB: 4, RY: 6, BY: 6, YY: 5 })) eq(field.filter((o) => o.pin === t).length, n, `${mode} ${t}`);
    const sup = sim.state.objects.filter((o) => o.loc === 'supply');
    eq(sup.filter((o) => o.kind === 'cup').length, 40, `${mode} supply cups`);
    eq(sup.filter((o) => o.kind === 'pin').length, 38, `${mode} supply pins`);
  }
});

test('Pinnacle loader rules', async () => {
  const sim = await makeSim(PINNACLE, 'solo');
  const hp = { alliance: 'red' as const, loader: 0, pin: 'RY' as const, cup: false };
  eq(sim.humanLoad(hp).ok, false, 'not before the match starts');
  sim.start();
  eq(sim.humanLoad(hp).ok, true, 'red loader');
  run(sim, 130);
  eq(sim.humanLoad(hp).ok, false, 'loader holds one object at a time');
  eq(sim.humanLoad({ ...hp, loader: 2, pin: 'BY' }).ok, true, 'solo may use the blue loaders and blue box');
  const a = await makeSim(PINNACLE, 'alliance');
  a.start();
  eq(a.humanLoad(hp).ok, true, 'alliance: loading allowed during Autonomous');
  eq(a.humanLoad({ alliance: 'blue', loader: 0, pin: 'BY', cup: false }).ok, false, 'blue cannot use red loaders');
});

test('Pinnacle alliance timer: 15 s Autonomous inside 120 s', async () => {
  const sim = await makeSim(PINNACLE, 'alliance', { empty: true });
  sim.start();
  run(sim, 15 * 120);
  eq(sim.phase, 'driver');
  run(sim, 105 * 120);
  eq(sim.phase, 'post');
});
