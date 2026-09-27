# Override Sim

A browser-based driver-practice simulator for the **VEX V5 Robotics Competition 2026-27 game "Override"**.
Top-down field, a physically based VEX drivetrain, match / skills / free-practice modes, and local personal bests.
It's a static site with no backend.

> Unofficial and fan-made. Not affiliated with VEX Robotics or the REC Foundation.
> **The field layout and point values are placeholders** (see [Values to verify](#values-to-verify)).
>
> The feature set and UX take cues from DSim (an FTC driving sim) as a reference only. No DSim source code was read, fetched or copied.

## Quick start

```bash
npm install
npm run dev              # local dev server
npx tsx scripts/smoke.ts # headless sim checks
npm run build            # typecheck + production build to dist/
```

The only dependencies are `vite`, `typescript` and `tsx` (dev).

## Controls

| Action        | Keyboard                                            | Gamepad                      |
| ------------- | --------------------------------------------------- | ---------------------------- |
| Drive         | W / S forward-back; A / D strafe (X-drive) or turn (tank) | Sticks (per drive mode) |
| Turn          | Q / E or ← / →                                      | Right stick X (Split Arcade) |
| Intake (hold) | Space                                               | RT / R2                      |
| Outtake       | Shift                                               | LT / L2                      |
| Align assist  | F                                                   | RB / R1                      |
| Start match   | Enter                                               | Start                        |
| Restart       | R                                                   | Back / Select                |
| Menu / pause  | Esc                                                 | —                            |

**Gamepad drive modes** (Settings):

- **Split Arcade** (default): left stick Y drives, right stick X turns. On an X-drive, left stick X strafes.
- **Arcade**: the left stick drives and turns. On an X-drive, right stick X strafes.
- **Tank**: each stick's Y drives one side. On an X-drive, the average stick X strafes.

**Field-centric** (X-drive only): "stick up" always means away from your driver wall, whatever way the robot faces.

Keyboard turning runs at 70% because keys are all-or-nothing. The keyboard and the gamepad can be used at the same time. You can't rebind keys or buttons.

## Game modes

- **Match**: 15 s Autonomous → 3 s pause → 1:45 Driver Control.
  - The robot is disabled in auton unless *Drive during autonomous* is on.
  - The scoreboard is live, the final 10 s show an ENDGAME banner, and the match ends with a breakdown: Pins per goal (including covered Pins and who the yellow Pins went to), midfield and auton bonus.
- **Skills**: a 1:00 solo run.
  - Red and blue Pins both count for you, and you can score on both alliances' goals. Yellow Pins still need the quadrant's Toggle.
- **Free practice**: no timer. **R** resets the robot and every piece to the spawn layout.
- **Records**: personal bests per mode and career totals, stored in `localStorage` only.
  - Bests: match score, skills score, most pieces in one practice session.
  - Career totals: matches, wins, skills runs, pieces scored, toggles flipped, practice time.

## Game rules

**Verified rules** (implemented as fixed values):

- **Pieces**: Pins are red, blue or yellow. Cups have no alliance color.
- **Quadrants**: the field splits into 4 quadrants, the triangles between the field diagonals.
  - Each quadrant holds 1 Alliance Goal, 1 neutral Short Goal and the Toggle at the center of its wall.
  - There are 2 red and 2 blue Alliance Goals, one per quadrant. Only that alliance can score on them.
  - The neutral Tall Goal sits in the Midfield, in no quadrant.
- **Goal heights**: Alliance 3.25", Short 5.77", Tall 8.77". A stack can't rise above its goal.
- **Alliance-color Pin** in a goal: 5 pts to that alliance.
- **Yellow Pin** in a goal: 10 pts to the alliance that owns the Toggle in that goal's quadrant, 0 while the Toggle is unowned.
  - Drive into a Toggle to flip it to your alliance. Flipping it moves those yellow Pins' points live.
- **Midfield**: 8 pts per robot inside at match end. An **ENDGAME** banner shows for the final 10 s.
- **Autonomous bonus**: 12 pts to the alliance with more auton points (6 each on a tie).

**Placeholders** (TODO-marked and configurable in `src/sim/fieldConfig.ts`):

- **Cup effect** (`RULES.cupCover`): a Cup on a stack covers the Pin directly beneath it, and a covered Pin scores nothing. Set it to `'none'` to switch covering off.
- **Tall Goal yellow Pins** (`RULES.tallYellowOwner`): they score for the alliance with more robots in the Midfield, and for nobody on a tie.
- **Midfield shape** (`MIDFIELD`): a diamond, |x| + |y| ≤ 24", judged by robot center.
- **Piece counts, colors and spawns**:
  - 52 Cups.
  - 63 Pins: 24 red, 24 blue and 15 yellow, including 3 yellow pre-stacked on the Tall Goal.
- **Auton line**: y = 0. A robot whose center crosses it during auton hands the auton bonus to the other alliance.

## Robot setup

Everything below is set in **Robot Setup** and saved to `localStorage`. The menu shows the computed stats live.

| Setting | Effect |
| --- | --- |
| Drivetrain | **Tank**: traction wheels, can't strafe, resists sideways sliding. **X-drive**: 4 omni wheels at 45°; it strafes, and drives forward √2× faster than its wheel speed. |
| Motor cartridge | 100 / 200 / 600 rpm V5 cartridges. The stall torque of each (2.1 / 1.05 / 0.35 N·m) sets pushing force. |
| External gear ratio | Wheel rpm ÷ motor rpm (for example 36:48 = 0.75). |
| Wheel diameter | 2.75" / 3.25" / 4". |
| Motor count | 4 / 6 / 8. More motors give more torque, so faster acceleration and stronger pushing, up to the traction limit. Top speed doesn't change. |
| Width / length | 10"–18" (18" × 18" starting-size limit). This is the collision footprint. |
| Intake style | **Compact**: reach about 3.5", no extra footprint. **Extended**: a deployed intake that reaches 5" further but adds a collision box in front. |
| Capacity | 1–3 pieces held at once (first in, first out). |
| Turn scrub | 0–80% of the ideal turn speed lost to wheels dragging sideways. The default of 55% takes the default tank from 731°/s (ideal) down to about 329°/s. It applies to X-drives too. |

**How the physics works:**

- **Top speed** = `cartridge rpm × gear ratio × π × wheel diameter / 60` in/s, ×√2 forward on an X-drive.
  - The default is 600 rpm × 0.75 on 3.25" wheels, which gives 76.6 in/s (6.4 ft/s).
- **Motor model**: each wheel pushes with `F = motors × stall force × (command − wheel speed / free speed)`.
  - That is voltage minus back-EMF, clamped to the wheel's traction limit (μ = 0.9, 6.8 kg robot).
  - The forces and torques integrate into chassis velocity at 120 Hz, with substeps when the gearing is stiff.
- **Wheel scrub** is a viscous yaw drag, sized so a full turn command settles at `(1 − scrub) ×` the ideal rate (`wheel speed ÷ half-track` on a tank), unless traction caps it first.
- **Motor-saturation normalization**: when fwd + strafe + turn would push any wheel past 100%, every wheel scales down together, so the direction of travel is kept.

## Assists (Settings, each can be toggled)

- **Auto-intake**: the intake runs by itself when a piece is in the intake zone.
- **Goal-align assist**: hold F / RB to rotate gently toward the nearest goal you can score on. It's a damped proportional turn added to your own input, and a dashed line shows the target.
- **Auto-score**: releases a held piece as soon as the release point is over a goal. A green ring marks the release point when a release would score.

Also in Settings:

- stick deadzone
- sensitivity curve (linear / cubic)
- max speed scale
- alliance and starting tile. The camera always looks out from your own driver wall.

## Architecture

```
src/
  sim/        pure, deterministic, serializable state machine (no DOM, no Date/performance)
    fieldConfig.ts  all field geometry + scoring values (plain data, TODO-marked)
    types.ts        SimState and friends: plain JSON objects
    robot.ts        config → derived physics; DC-motor drivetrain integrator
    geometry.ts     OBB / circle / SAT helpers
    prng.ts         mulberry32 kept inside SimState
    sim.ts          createSim / startMatch / stepSim / computeScore
  input/      mapping.ts (pure stick/key → RobotCommand) + input.ts (keyboard/gamepad DOM)
  render/     Canvas 2D top-down renderer with alliance-perspective camera + interpolation
  ui/         plain-DOM menus, HUD, overlays, localStorage persistence
scripts/smoke.ts  headless checks
```

- `stepSim(state, commands)` takes a `Record<robotId, RobotCommand>` and advances exactly 1/120 s.
  - The state is JSON-serializable, and the same seed with the same inputs always gives an identical state.
  - The smoke script checks both of these.
- The sim already handles N robots, including robot-robot collisions and per-robot commands.
  - Only one human robot is spawned today; 2v2 needs only more `RobotSpawn`s and command sources.
- `main.ts` runs a fixed 120 Hz accumulator.
  - The renderer interpolates between the last two ticks on `requestAnimationFrame`.

## Smoke checks

`npx tsx scripts/smoke.ts` runs 84 headless checks:

- spawns: counts (Cups, 63 Pins by color, 9 Goals, 4 Toggles), no overlapping spawns, one Alliance Goal + Short Goal + Toggle per quadrant, goal heights
- drive stats and top speed (tank and X-drive), strafing, field-centric
- turning: turn rate, turning in place, a default of 300–350°/s after scrub
- wall and goal collisions, robot-robot collisions
- intake, outtake and capacity
- scoring on a goal, alliance-goal rejection, stack-height limit
- the auto-intake, auto-score and align assists
- toggle flips, including physical flips moving a yellow Pin's points from one alliance to the other
- exact match phase timing (15 / 3 / 105 s), the ENDGAME window, skills timing
- the final score calculation:
  - alliance Pin = 5
  - yellow Pin = 10 with an owned Toggle, 0 with an unowned one
  - Cup covering, including the `'none'` rule option
  - Tall Goal yellow ownership
  - midfield 8 per robot, inside or outside the diamond
  - auton bonus 12, tie 6/6, auton-line violation
- skills scoring
- determinism and JSON round-trips
- input mapping: modes, deadzone, curve, field-centric

## Deploy to Vercel

1. Push this folder to a GitHub, GitLab or Bitbucket repo.
2. In Vercel, click **Add New… → Project → Import** and pick the repo.
3. Set **Framework Preset** to **Vite**. The build command is `npm run build` and the output directory is `dist`. Vercel usually fills these in automatically.
4. Click **Deploy**.

No environment variables or `vercel.json` are needed.

## Design choices and assumptions

These are the calls I made myself where the spec left room:

- **Unconfirmed rules** are defaults you can switch in `RULES` (see [Game rules](#game-rules)).
- **Stack heights**: each piece adds a placeholder height (Pin 1.0", Cup 0.75"), so an Alliance Goal holds 3 Pins.
- **No descoring.** Pieces on a goal stay there.
- **Scoring rules**:
  - You can't score on the opposing alliance's goals.
  - In Skills, red and blue Pins both count for you.
- **Midfield and auton**:
  - The Midfield is judged by the robot's center.
  - Crossing the auton line during auton forfeits the auton bonus.
- **Robot model**:
  - The robot weighs a fixed 6.8 kg (15 lb), and wheel μ = 0.9.
  - The inputs are nominal V5 free speeds and stall torques, with no current limiting or battery sag.
- **Turning** is slowed by the *Turn scrub* setting (default 55%), which brings the default robot to about 329°/s.
- **Piece physics**:
  - Pieces are light circles that robots shove.
  - A piece pinned against a wall or goal pushes the robot back instead.
  - Pieces have no momentum.
- **Toggles** flip on contact. Their zone is 12" along the wall and 4" deep.
- **Keyboard**: turning is scaled to 70%, and on a tank drive A/D turn.
- **Records** only count a match or skills run once it's finished. Pieces scored in aborted sessions still add to the career total.
- **Tab switching**: if the tab is hidden mid-match, the game pauses.

## Values to verify

Every item below is marked `// TODO: verify against game manual` in `src/sim/fieldConfig.ts`:

| Item | Current placeholder |
| --- | --- |
| Perimeter size | 144" × 144" inside the walls (`FIELD_HALF = 72`) |
| Cup / Pin radius | 2.5" / 1.5" |
| Stack height per piece | Pin 1.0", Cup 0.75" (`PIECE_STACK_HEIGHT`) |
| Goal positions | N quadrant: Short (−18, 42), Alliance (18, 54). The other quadrants are 90° rotations of it |
| Alliance Goal color per quadrant | N red, S blue, E red, W blue (`QUADRANT_ALLIANCE`) |
| Goal base radii | Tall 4", Short and Alliance 3" |
| Tall Goal preload | 3 yellow Pins |
| Toggle size | 12" wide × 4" deep, at the center of each wall |
| Midfield shape | diamond \|x\| + \|y\| ≤ 24" (`MIDFIELD`) |
| Cup effect | covers the Pin directly beneath it (`RULES.cupCover`) |
| Tall Goal yellow owner | alliance with more robots in the Midfield (`RULES.tallYellowOwner`) |
| Auton line | y = 0; crossing is judged by the robot's center |
| Starting tiles | red (±36, 60) facing −y; blue (±36, −60) facing +y |
| Cup count and spawns | 52 (`HALF_CUPS`, mirrored) |
| Pin colors and spawns | 24 red + 24 blue + 12 yellow on the floor (`LINE_PINS`, `HALF_PINS`), + 3 yellow on the Tall Goal |
| Timing | auton 15 s, driver 1:45, skills 1:00 |

Already verified, so not TODO: Pin values (5 / 10), the quadrant structure, goal heights, midfield 8 pts, ENDGAME in the last 10 s, and the auton bonus (12, 6/6 on a tie).

Other tuning constants in `sim.ts` (not from the manual) are worth checking against real robots:

- goal capture radius: 5"
- release gap: 3"
- intake cooldown: 0.12 s
- outtake cooldown: 0.3 s
- align assist: range 72", gains

The robot constants in `robot.ts` (mass, μ) fall in the same category.
