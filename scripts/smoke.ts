/* Headless smoke checks for the sim core. Run: npx tsx scripts/smoke.ts */
import { FIELD_HALF, quadrantOf, RULES, SCORING, STARTING_TILES } from '../src/sim/fieldConfig';
import { circleVsObb, obbExtent, obbVsObb, localToObb } from '../src/sim/geometry';
import { DEFAULT_ROBOT_CONFIG, deriveRobot } from '../src/sim/robot';
import {
  addPiece,
  computeScore,
  createSim,
  inMidfield,
  isEndgame,
  NEUTRAL_COMMAND,
  PLAYER_ID,
  releasePoint,
  robotObbs,
  secondsToTicks,
  stackHeight,
  startMatch,
  stepSim,
  TICK_HZ,
} from '../src/sim/sim';
import { mapDriverInput, type DriverTuning, type KeyState } from '../src/input/mapping';
import type { Alliance, GameMode, RobotCommand, RobotConfig, SimState } from '../src/sim/types';

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const cmd = (p: Partial<RobotCommand> = {}): RobotCommand => ({ ...NEUTRAL_COMMAND, ...p });

function makeSim(opts: { mode?: GameMode; config?: Partial<RobotConfig>; empty?: boolean; alliance?: Alliance; seed?: number; autonDrive?: boolean } = {}): SimState {
  const alliance = opts.alliance ?? 'red';
  return createSim({
    mode: opts.mode ?? 'free',
    seed: opts.seed ?? 7,
    playerAlliance: alliance,
    autonDrive: opts.autonDrive,
    emptyField: opts.empty ?? true,
    robots: [{ id: PLAYER_ID, alliance, side: 'left', config: { ...DEFAULT_ROBOT_CONFIG, ...opts.config }, human: true }],
  });
}
function place(s: SimState, x: number, y: number, theta: number, i = 0): void {
  const r = s.robots[i];
  Object.assign(r, { x, y, theta, vx: 0, vy: 0, omega: 0 });
}
function run(s: SimState, c: RobotCommand | Record<string, RobotCommand>, seconds: number): void {
  const cmds = 'fwd' in c ? { [PLAYER_ID]: c as RobotCommand } : (c as Record<string, RobotCommand>);
  const n = secondsToTicks(seconds);
  for (let i = 0; i < n; i++) stepSim(s, cmds);
}

// ------------------------------------------------------------------ spawns
{
  const s = makeSim({ empty: false, mode: 'match' });
  const cups = s.pieces.filter((p) => p.kind === 'cup');
  const pins = s.pieces.filter((p) => p.kind === 'pin');
  // Cup count follows fieldConfig (52 at the moment); the original brief said 56. Both are TODO until the manual is checked.
  check('spawn: 52 Cups, all neutral', cups.length === 52 && cups.every((p) => p.color === null), `${cups.length}`);
  check('spawn: 63 Pins', pins.length === 63, `${pins.length}`);
  const pinCount = (c: string) => pins.filter((p) => p.color === c).length;
  check('spawn: Pins are red / blue / yellow (24 / 24 / 15 incl. 3 on the Tall Goal)', pinCount('red') === 24 && pinCount('blue') === 24 && pinCount('yellow') === 15);
  check('spawn: 9 Goals', s.goals.length === 9);
  check(
    'spawn: each quadrant holds 1 alliance goal, 1 short goal, 1 toggle; Tall Goal in Midfield',
    [0, 1, 2, 3].every(
      (q) =>
        s.goals.filter((g) => g.quadrant === q && g.kind === 'alliance').length === 1 &&
        s.goals.filter((g) => g.quadrant === q && g.kind === 'short').length === 1 &&
        s.toggles.filter((t) => quadrantOf(t.x, t.y) === q).length === 1,
    ) && s.goals.some((g) => g.kind === 'tall' && g.quadrant === null && inMidfield(g)),
  );
  check(
    'spawn: goal heights 3.25 / 5.77 / 8.77"',
    s.goals.every((g) => g.height === { alliance: 3.25, short: 5.77, tall: 8.77 }[g.kind]),
  );
  check(
    'spawn: 4 short / 1 tall / 2+2 alliance goals',
    s.goals.filter((g) => g.kind === 'short').length === 4 &&
      s.goals.filter((g) => g.kind === 'tall').length === 1 &&
      s.goals.filter((g) => g.alliance === 'red').length === 2 &&
      s.goals.filter((g) => g.alliance === 'blue').length === 2,
  );
  check('spawn: 4 Toggles, all neutral', s.toggles.length === 4 && s.toggles.every((t) => t.owner === null));
  check('spawn: piece ids index the array', s.pieces.every((p, i) => p.id === i));

  const floor = s.pieces.filter((p) => p.state === 'floor');
  let overlaps = 0;
  for (let i = 0; i < floor.length; i++) {
    const a = floor[i];
    if (Math.abs(a.x) > FIELD_HALF - a.r || Math.abs(a.y) > FIELD_HALF - a.r) overlaps++;
    for (let j = i + 1; j < floor.length; j++) {
      const b = floor[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) overlaps++;
    }
    for (const g of s.goals) if (Math.hypot(a.x - g.x, a.y - g.y) < a.r + g.r) overlaps++;
    for (const al of ['red', 'blue'] as const) {
      for (const side of ['left', 'right'] as const) {
        const t = STARTING_TILES[al][side];
        const box = localToObb({ cx: 0, cy: 0, hx: 9, hy: 9 }, t.x, t.y, t.theta);
        if (circleVsObb(a.x, a.y, a.r, box)) overlaps++;
      }
    }
  }
  check('spawn: no piece overlaps pieces/goals/walls/18" start boxes', overlaps === 0, `${overlaps} overlaps`);
}

// ------------------------------------------------------------------ robot stats
{
  const d = deriveRobot(DEFAULT_ROBOT_CONFIG);
  const expected = ((600 * 0.75) / 60) * Math.PI * 3.25;
  check('stats: 600rpm x 36:48 = 450 wheel rpm', near(d.wheelRpm, 450, 1e-9));
  check('stats: 450rpm on 3.25" = 76.58 in/s', near(d.topSpeed, expected, 1e-9), d.topSpeed.toFixed(2));
  const x = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, drivetrain: 'xdrive' });
  check('stats: X-drive forward speed = sqrt(2) x wheel speed', near(x.topSpeed, expected * Math.SQRT2, 1e-9));
  const m4 = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, motorCount: 4 });
  const m8 = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, motorCount: 8 });
  check('stats: more motors accelerate faster', m8.timeToTop < d.timeToTop && d.timeToTop < m4.timeToTop, `${m4.timeToTop.toFixed(2)} > ${d.timeToTop.toFixed(2)} > ${m8.timeToTop.toFixed(2)} s`);
  const slow = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, cartridgeRpm: 100, gearRatio: 0.6, wheelDiameter: 4, motorCount: 8 });
  check('stats: stiff torque-heavy gearing still finite', Number.isFinite(slow.timeToTop) && slow.substeps > 1, `substeps ${slow.substeps}`);
}

// ------------------------------------------------------------------ drive
{
  const s = makeSim();
  place(s, 30, -55, Math.PI / 2); // x = 30 is a clear lane between the goals
  run(s, cmd({ fwd: 1 }), 1.2);
  const r = s.robots[0];
  const v = Math.hypot(r.vx, r.vy);
  check('drive: tank reaches top speed (±2%)', near(v, r.derived.topSpeed, r.derived.topSpeed * 0.02), `${v.toFixed(1)} / ${r.derived.topSpeed.toFixed(1)} in/s`);
  check('drive: tank goes straight', near(r.x, 30, 0.05) && near(r.theta, Math.PI / 2, 1e-3));
}
{
  const s = makeSim({ config: { drivetrain: 'xdrive', cartridgeRpm: 200, gearRatio: 1, wheelDiameter: 2.75 } });
  place(s, 30, -55, Math.PI / 2);
  run(s, cmd({ fwd: 1 }), 1.5);
  const r = s.robots[0];
  const v = Math.hypot(r.vx, r.vy);
  check('drive: X-drive reaches top speed (±2%)', near(v, r.derived.topSpeed, r.derived.topSpeed * 0.02), `${v.toFixed(1)} / ${r.derived.topSpeed.toFixed(1)} in/s`);
  place(s, 0, -30, Math.PI / 2);
  run(s, cmd({ strafe: 1 }), 0.5);
  check('drive: X-drive strafes right (robot facing +y -> +x)', s.robots[0].x > 10 && near(s.robots[0].y, -30, 0.5), `x=${s.robots[0].x.toFixed(1)}`);
}
{
  const s = makeSim({ config: { drivetrain: 'xdrive' } });
  place(s, 0, -48, 0);
  const field = { x: 0, y: 1 };
  run(s, cmd({ field }), 0.4);
  const r = s.robots[0];
  check('drive: field-centric moves along field +y regardless of heading', r.y > -40 && near(r.x, 0, 0.5), `(${r.x.toFixed(1)}, ${r.y.toFixed(1)})`);
}
{
  const s = makeSim();
  place(s, 0, -48, 0);
  run(s, cmd({ turn: 1 }), 1.5);
  const r = s.robots[0];
  check('turn: clockwise command spins clockwise', r.omega < 0);
  check('turn: reaches max turn rate (±5%)', near(-r.omega, r.derived.maxTurnRate, r.derived.maxTurnRate * 0.05), `${((-r.omega * 180) / Math.PI).toFixed(0)} deg/s`);
  check('turn: turns in place', Math.hypot(r.x, r.y + 48) < 0.5);
  const degPerSec = (-r.omega * 180) / Math.PI;
  check('turn: default robot turns 300-350 deg/s at full stick (wheel scrub)', degPerSec >= 300 && degPerSec <= 350, `${degPerSec.toFixed(0)} deg/s`);
  const ideal = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, turnScrub: 0 });
  check('turn: scrub 0 = ideal wheel-speed / half-track rate', near(ideal.maxTurnRate, ideal.wheelFreeSpeed / (DEFAULT_ROBOT_CONFIG.width / 2 - 1.5), 1e-9));
  const xs = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, drivetrain: 'xdrive' });
  const xi = deriveRobot({ ...DEFAULT_ROBOT_CONFIG, drivetrain: 'xdrive', turnScrub: 0 });
  check('turn: scrub also slows X-drive turning', xs.maxTurnRate < xi.maxTurnRate);
}
{
  const s = makeSim();
  place(s, 40, 50, Math.PI / 2);
  run(s, cmd({ fwd: 1 }), 2);
  const r = s.robots[0];
  const maxY = Math.max(...robotObbs(r).map((o) => o.y + obbExtent(o).ey));
  check('wall: robot stays inside the perimeter', maxY <= FIELD_HALF + 1e-6, `maxY ${maxY.toFixed(3)}`);
  check('wall: robot ends pressed on the wall, stopped', maxY > FIELD_HALF - 0.05 && Math.abs(r.vy) < 1, `vy ${r.vy.toFixed(2)}`);
}
{
  const s = makeSim();
  place(s, 0, -40, Math.PI / 2);
  run(s, cmd({ fwd: 1 }), 2);
  const r = s.robots[0];
  const hit = robotObbs(r).some((o) => circleVsObb(0, 0, 4, o) !== null);
  check('goal: robot cannot drive through the Tall Goal', !hit && r.y < -4, `y ${r.y.toFixed(2)}`);
}
{
  const s = createSim({
    mode: 'free',
    playerAlliance: 'red',
    emptyField: true,
    robots: [
      { id: PLAYER_ID, alliance: 'red', side: 'left', config: DEFAULT_ROBOT_CONFIG, human: true },
      { id: 'b1', alliance: 'blue', side: 'left', config: DEFAULT_ROBOT_CONFIG },
    ],
  });
  place(s, 30, 20, -Math.PI / 2, 0);
  place(s, 30, -10, Math.PI / 2, 1);
  run(s, { [PLAYER_ID]: cmd({ fwd: 1 }), b1: cmd() }, 1.5);
  const [a, b] = s.robots;
  const overlap = robotObbs(a).some((oa) => robotObbs(b).some((ob) => (obbVsObb(oa, ob)?.depth ?? 0) > 0.25));
  check('robots: 2 robots collide without overlapping; pusher moves the other', !overlap && b.y < -12, `b.y ${b.y.toFixed(1)}`);
}

// ------------------------------------------------------------------ intake / outtake / scoring
{
  const s = makeSim();
  place(s, -40, 0, 0);
  const r = s.robots[0];
  const cup = addPiece(s, 'cup', 'red', -40 + r.derived.frontOffset + 2.6, 0);
  run(s, cmd({ intake: true }), 0.2);
  check('intake: collects a Cup touching the intake zone', r.held.length === 1 && cup.state === 'held' && cup.holder === PLAYER_ID);
  run(s, cmd({ outtake: true }), 0.05);
  const rp = releasePoint(r);
  check('outtake: places the Cup on the floor in front', r.held.length === 0 && cup.state === 'floor' && Math.hypot(cup.x - rp.x, cup.y - rp.y) < 1, `${cup.x.toFixed(1)}, ${cup.y.toFixed(1)}`);

  const s2 = makeSim({ config: { capacity: 2 } });
  place(s2, -40, 0, 0);
  const r2 = s2.robots[0];
  const fx = -40 + r2.derived.frontOffset + 2;
  addPiece(s2, 'pin', null, fx, -4);
  addPiece(s2, 'pin', null, fx, 0);
  addPiece(s2, 'pin', null, fx, 4);
  run(s2, cmd({ intake: true }), 1);
  check('intake: respects capacity', r2.held.length === 2, `${r2.held.length}`);

  const s3 = makeSim();
  place(s3, -40, 0, 0);
  addPiece(s3, 'pin', null, -40 + s3.robots[0].derived.frontOffset + 2, 0);
  run(s3, cmd({ autoIntake: true }), 0.1);
  check('assist: auto-intake grabs a piece in front without the button', s3.robots[0].held.length === 1);

  const s4 = makeSim({ config: { intakeStyle: 'extended' } });
  const d4 = s4.robots[0].derived;
  check('robot: extended intake reaches further and adds footprint', d4.frontOffset > deriveRobot(DEFAULT_ROBOT_CONFIG).frontOffset && d4.shapes.length === 2);
}
{
  const s = makeSim();
  const r = s.robots[0];
  const hold = (kind: 'cup' | 'pin', color: 'red' | 'blue' | 'yellow' | null) => {
    const p = addPiece(s, kind, color, 0, 0);
    p.state = 'held';
    p.holder = r.id;
    r.held.push(p.id);
    return p;
  };
  const goal = s.goals.find((g) => g.label === 'Short Goal N')!;
  const pin = hold('pin', 'red');
  place(s, goal.x - goal.r - r.derived.frontOffset - 0.2, goal.y, 0);
  const before = computeScore(s).red.total;
  run(s, cmd({ outtake: true }), 0.05);
  const after = computeScore(s).red.total;
  check('score: outtake onto a Short Goal stacks the Pin', goal.stack.includes(pin.id) && pin.state === 'scored');
  check('score: red Pin in a goal = +5 to red', after - before === SCORING.alliancePin && SCORING.alliancePin === 5, `+${after - before}`);
  check('score: robot stat counts the score', r.stats.scored === 1);

  const blueGoal = s.goals.find((g) => g.label === 'Blue Goal W')!;
  const pin2 = hold('pin', 'red');
  place(s, blueGoal.x + blueGoal.r + r.derived.frontOffset + 0.2, blueGoal.y, Math.PI);
  run(s, cmd({ outtake: true }), 0.35); // outlasts the 0.3 s outtake cooldown from the previous release
  check('score: red robot cannot score on a Blue Alliance Goal (drops to floor)', blueGoal.stack.length === 0 && pin2.state === 'floor');

  const pin3 = hold('pin', 'blue');
  place(s, goal.x - goal.r - r.derived.frontOffset - 0.2, goal.y, 0);
  run(s, cmd({ autoScore: true }), 0.35);
  check('assist: auto-score releases onto an aligned goal', goal.stack.includes(pin3.id));

  // stack height: Short Goal is 5.77" tall; fill it and the next piece is refused
  const allied = s.goals.find((g) => g.label === 'Red Goal N')!;
  let placed = 0;
  for (let i = 0; i < 6; i++) {
    hold('pin', 'red');
    r.outtakeCooldown = 0;
    place(s, allied.x - allied.r - r.derived.frontOffset - 0.2, allied.y, 0);
    const n = allied.stack.length;
    run(s, cmd({ outtake: true }), 1 / TICK_HZ);
    if (allied.stack.length > n) placed++;
    else break;
  }
  check('score: stacks stop at the goal height (3.25" Alliance Goal)', placed === 3 && stackHeight(s, allied) <= allied.height, `${placed} Pins`);
}
{
  const s = makeSim();
  place(s, 10, 40, Math.PI);
  run(s, cmd({ align: true }), 2);
  const r = s.robots[0];
  const g = s.goals.find((gg) => gg.label === 'Red Goal N')!;
  const err = Math.abs(Math.atan2(g.y - r.y, g.x - r.x) - r.theta);
  const errDeg = (Math.min(err, 2 * Math.PI - err) * 180) / Math.PI;
  check('assist: goal-align turns toward the nearest scorable goal', r.alignTarget === g.id && errDeg < 5, `${errDeg.toFixed(1)} deg`);
}

// ------------------------------------------------------------------ toggles
{
  const s = makeSim();
  place(s, 50, 0, 0);
  run(s, cmd({ fwd: 1 }), 1.5);
  const t = s.toggles.find((tt) => tt.x === FIELD_HALF)!;
  check('toggle: driving into a Toggle flips it to your alliance', t.owner === 'red' && s.robots[0].stats.toggles === 1);
}

// ------------------------------------------------------------------ match flow
{
  const s = makeSim({ mode: 'match', empty: false });
  run(s, cmd(), 1);
  check('match: waits in pre-match until started', s.phase === 'pre' && s.phaseTick === 0);
  startMatch(s);
  const auton = secondsToTicks(15);
  for (let i = 0; i < auton - 1; i++) stepSim(s, {});
  check('match: still auton at 14.99 s', s.phase === 'auton');
  stepSim(s, {});
  check('match: auton ends at exactly 15 s', s.phase === 'transition' && s.autonScore !== null);
  run(s, cmd(), 3);
  check('match: 3 s transition then driver', s.phase === 'driver');
  const t1 = secondsToTicks(94.9);
  const t2 = secondsToTicks(0.2);
  for (let i = 0; i < t1; i++) stepSim(s, {});
  check('match: no ENDGAME with 10.1 s left', !isEndgame(s));
  for (let i = 0; i < t2; i++) stepSim(s, {});
  check('match: ENDGAME in the final 10 s', isEndgame(s));
  for (let i = 0; i < secondsToTicks(105) - 1 - t1 - t2; i++) stepSim(s, {});
  check('match: still driver at 1:44.99', s.phase === 'driver');
  stepSim(s, {});
  check('match: ends after 1:45 driver with a final score', s.phase === 'post' && s.finalScore !== null);
  check('match: total ticks = (15 + 3 + 105) s', s.tick === secondsToTicks(1) + (15 + 3 + 105) * TICK_HZ, `${s.tick}`);
}
{
  const s = makeSim({ mode: 'match', empty: true });
  startMatch(s);
  const x0 = s.robots[0].x;
  run(s, cmd({ fwd: 1 }), 1);
  check('match: robot disabled during auton by default', s.robots[0].x === x0 && s.robots[0].y === STARTING_TILES.red.left.y);
}
{
  const s = makeSim({ mode: 'skills' });
  startMatch(s);
  check('skills: starts straight into a 1:00 driver period', s.phase === 'driver');
  run(s, cmd(), 60);
  check('skills: ends after 60 s', s.phase === 'post');
}

// ------------------------------------------------------------------ final score calc
{
  const s = makeSim({ mode: 'match', empty: false });
  const take = (pred: (p: SimState['pieces'][number]) => boolean) => s.pieces.find((p) => p.state === 'floor' && pred(p))!;
  const stackOn = (label: string, p: SimState['pieces'][number]) => {
    const g = s.goals.find((gg) => gg.label === label)!;
    p.state = 'scored';
    p.goal = g.id;
    g.stack.push(p.id);
  };
  const pinOf = (c: string) => take((p) => p.kind === 'pin' && p.color === c);
  const toggleIn = (q: number) => s.toggles.find((t) => quadrantOf(t.x, t.y) === q)!;
  const goalScore = (sc: ReturnType<typeof computeScore>, label: string) => sc.goals.find((g) => g.label === label)!;
  stackOn('Short Goal N', pinOf('red'));
  stackOn('Short Goal N', pinOf('yellow'));
  stackOn('Red Goal E', pinOf('blue'));
  stackOn('Red Goal E', take((p) => p.kind === 'cup'));
  stackOn('Red Goal E', pinOf('yellow'));
  stackOn('Short Goal S', pinOf('blue'));
  toggleIn(0).owner = 'red'; // N quadrant
  place(s, 0, 15, 0); // inside the Midfield diamond
  s.autonScore = { red: 10, blue: 0 };
  const sc = computeScore(s);
  const n = goalScore(sc, 'Short Goal N');
  const e = goalScore(sc, 'Red Goal E');
  const tall = goalScore(sc, 'Tall Goal');
  check('final: red Pin 5 + yellow Pin 10 with the N Toggle owned by red', n.red === 15 && n.blue === 0 && SCORING.yellowPin === 10);
  check('final: yellow Pin scores 0 while its quadrant Toggle is unowned', e.yellowOwner === null && e.yellowPins === 1 && e.red === 0 && e.blue === 0);
  check('final: a Cup on a Pin covers it (covered Pin scores 0)', e.covered === 1 && e.bluePins === 0);
  check('final: blue Pin = 5 to blue (Short Goal S)', goalScore(sc, 'Short Goal S').blue === 5);
  check('final: Tall Goal yellows go to the alliance with more robots in Midfield', tall.yellowOwner === 'red' && tall.red === 30);
  check('final: 8 pts per robot in the Midfield', sc.red.parked === 1 && sc.red.midfieldPoints === 8 && sc.blue.midfieldPoints === 0);
  check('final: auton bonus 12 to the auton winner', sc.autonWinner === 'red' && sc.red.autonBonus === 12 && sc.blue.autonBonus === 0);
  check('final: red = 5 + 10 + 30 tall + 8 park + 12 auton = 65', sc.red.total === 65, `${sc.red.total}`);
  check('final: blue = 5', sc.blue.total === 5, `${sc.blue.total}`);

  toggleIn(2).owner = 'blue'; // E quadrant
  check('final: flipping the E Toggle hands its yellow Pins to blue', goalScore(computeScore(s), 'Red Goal E').blue === 10 && computeScore(s).blue.total === 15);
  toggleIn(0).owner = 'blue';
  const flipped = goalScore(computeScore(s), 'Short Goal N');
  check('final: flipping the N Toggle moves its yellow Pin, not the red Pin', flipped.red === 5 && flipped.blue === 10);

  RULES.cupCover = 'none';
  check('rules: cupCover "none" lets the covered Pin score', goalScore(computeScore(s), 'Red Goal E').blue === 15);
  RULES.cupCover = 'pin-below';

  place(s, 20, 10, 0); // |x| + |y| = 30 > 24: outside the diamond
  const out = computeScore(s);
  check('final: robot outside the Midfield diamond earns nothing; Tall yellows unowned', out.red.midfieldPoints === 0 && goalScore(out, 'Tall Goal').red === 0);

  s.autonScore = { red: 5, blue: 5 };
  const tie = computeScore(s);
  check('final: tied auton splits the bonus 6 / 6', tie.autonWinner === 'tie' && tie.red.autonBonus === 6 && tie.blue.autonBonus === 6);
  s.autonViolation.red = true;
  check('final: crossing the auton line hands the bonus to the opponent', computeScore(s).autonWinner === 'blue' && computeScore(s).blue.autonBonus === 12);
}
{
  // Physical toggle flips change yellow Pin ownership live.
  const s = createSim({
    mode: 'free',
    playerAlliance: 'red',
    emptyField: true,
    robots: [
      { id: PLAYER_ID, alliance: 'red', side: 'left', config: DEFAULT_ROBOT_CONFIG, human: true },
      { id: 'b1', alliance: 'blue', side: 'left', config: DEFAULT_ROBOT_CONFIG },
    ],
  });
  const g = s.goals.find((gg) => gg.label === 'Short Goal E')!;
  const y = addPiece(s, 'pin', 'yellow', g.x, g.y);
  y.state = 'scored';
  y.goal = g.id;
  g.stack.push(y.id);
  check('toggle: yellow Pin on Short Goal E starts unowned', computeScore(s).red.yellowPoints === 0 && computeScore(s).blue.yellowPoints === 0);
  place(s, 50, 0, 0, 0);
  place(s, -50, -40, 0, 1);
  run(s, { [PLAYER_ID]: cmd({ fwd: 1 }), b1: cmd() }, 1.5);
  check('toggle: red drives into the E Toggle -> yellow Pin scores 10 for red', computeScore(s).red.yellowPoints === 10);
  place(s, 0, 40, 0, 0);
  place(s, 50, 0, 0, 1);
  run(s, { [PLAYER_ID]: cmd(), b1: cmd({ fwd: 1 }) }, 1.5);
  const sc = computeScore(s);
  check('toggle: blue flips it back -> the yellow Pin now scores for blue', sc.blue.yellowPoints === 10 && sc.red.yellowPoints === 0);
}
{
  const s = makeSim({ mode: 'match', empty: true, autonDrive: true });
  startMatch(s);
  place(s, 30, 10, -Math.PI / 2);
  run(s, cmd({ fwd: 1 }), 0.5);
  check('auton: driving across the auton line is flagged', s.autonViolation.red && !s.autonViolation.blue);
}
{
  const s = makeSim({ mode: 'skills', empty: false });
  const bluePin = s.pieces.find((p) => p.kind === 'pin' && p.color === 'blue' && p.state === 'floor')!;
  const g = s.goals.find((gg) => gg.label === 'Blue Goal S')!;
  bluePin.state = 'scored';
  bluePin.goal = g.id;
  g.stack.push(bluePin.id);
  const sc = computeScore(s);
  check('skills: alliance Pins of either color count for the solo robot', sc.red.total === SCORING.alliancePin && sc.blue.total === 0);
}

// ------------------------------------------------------------------ determinism / serialization
{
  const script = (s: SimState, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = s.tick;
      stepSim(s, {
        [PLAYER_ID]: cmd({ fwd: Math.sin(t / 50), turn: Math.cos(t / 77) * 0.6, intake: t % 200 < 150, outtake: t % 200 >= 180, autoScore: true }),
      });
    }
  };
  const a = makeSim({ empty: false, seed: 42 });
  const b = makeSim({ empty: false, seed: 42 });
  script(a, 1200);
  script(b, 1200);
  check('determinism: same seed + inputs -> identical state', JSON.stringify(a) === JSON.stringify(b));
  const c = JSON.parse(JSON.stringify(a)) as SimState;
  script(a, 600);
  script(c, 600);
  check('serialization: JSON round-trip continues identically', JSON.stringify(a) === JSON.stringify(c));
  const moved = a.pieces.some((p, i) => p.state === 'floor' && (p.x !== makeSim({ empty: false }).pieces[i].x));
  check('determinism: scripted run actually interacted with pieces', moved || a.robots[0].stats.intaked > 0);
}

// ------------------------------------------------------------------ input mapping
{
  const tune: DriverTuning = { driveMode: 'tank', deadzone: 0.1, curve: 'linear', maxSpeed: 1, fieldCentric: false, autoIntake: false, alignAssist: true, autoScore: false };
  const noKeys: KeyState = { fwd: 0, strafe: 0, turn: 0, intake: false, outtake: false, align: false };
  const pad = { lx: 0, ly: -1, rx: 0, ry: 1, intake: false, outtake: false, align: false };
  const t1 = mapDriverInput(pad, noKeys, tune, 'tank', 'red');
  check('input: tank sticks L up / R down = spin clockwise', near(t1.fwd, 0, 1e-9) && near(t1.turn, 1, 1e-9));
  const t2 = mapDriverInput({ ...pad, ly: -1, ry: 0, rx: -1 }, noKeys, { ...tune, driveMode: 'split' }, 'tank', 'red');
  check('input: split arcade = left Y drive, right X turn', near(t2.fwd, 1, 1e-9) && near(t2.turn, -1, 1e-9));
  const t3 = mapDriverInput({ ...pad, ly: -0.05, ry: 0 }, noKeys, tune, 'tank', 'red');
  check('input: deadzone zeroes small stick input', t3.fwd === 0 && t3.turn === 0);
  const t4 = mapDriverInput({ ...pad, ly: -0.55, ry: -0.55 }, noKeys, { ...tune, curve: 'cubic', maxSpeed: 0.5 }, 'tank', 'red');
  check('input: cubic curve + max speed scale', near(t4.fwd, 0.5 ** 3 * 0.5, 1e-9));
  const t5 = mapDriverInput(null, { ...noKeys, fwd: 1, strafe: 1 }, { ...tune, fieldCentric: true }, 'xdrive', 'red');
  check('input: field-centric from red wall maps "forward" to field -y', t5.field !== null && near(t5.field.y, -1, 1e-9) && near(t5.field.x, -1, 1e-9));
  const t6 = mapDriverInput(null, { ...noKeys, strafe: -1, align: true }, { ...tune, alignAssist: false }, 'tank', 'blue');
  check('input: A turns a tank drive left; align ignored when assist off', t6.turn < 0 && t6.strafe === 0 && !t6.align);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
