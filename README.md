# ZDrive

**3D driver practice for VEX Override and RECF Pinnacle.**

ZDrive is a free, static web app for practicing driving in the two 2026-27 games that share the same Pins and Cups:

- **VEX V5RC Override**
- **RECF Achieve Pinnacle**

Build a robot, drive full matches against partner and opponent bots, run skills and solo routines, watch replays, and track your records. Everything runs in the browser, and everything is saved locally.

> ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF.

## Features

- A game hub for each game (**Play / Configure / Records**) over a live 3D field, a game switcher in the top bar, and deep links such as `/override`, `/pinnacle/play`, `/override/robot` and `/override/settings/controls`
- Every menu works with mouse, keyboard or gamepad alone (D-pad moves focus, A selects, B goes back, LB/RB switch tabs); key hints follow the last device used
- A design system with dark, light and colorblind palettes, a UI scale setting and reduced motion; `/design` shows every component and state
- A 3D field built with three.js and Rapier physics at a fixed 120 Hz. Rendering interpolates between physics steps.
- Cameras: **Driver Station**, **Driver Station (tracking)**, **Chase**, **Orbit** (drag and scroll), **Overhead 2D** (flat top-down) and **Audience**
- A **robot builder** with a live 3D turntable preview, derived top speed, turn rate and push force, a legality panel, presets, saved robots, and export/import as `ZDRIVE1:` strings
- **Field-centric or robot-centric** driving, plus toggleable assists:
  - goal auto-align (hold)
  - auto lift height (on by default: rises to drop height near a goal, lowers near a loose piece)
  - auto-place when aligned (on by default; releases only when the robot is nearly stopped)
  - auto-grab
  - toggle/roller helper
- **Placement guides:** the target goal's rim glows amber when you're near and green when releasing now would score; a drop line shows where a held piece is, and the piece your claw would grab is ringed
- **Bots** as partners or opponents:
  - styles: Scorer, Toggle/Roller controller, Defender, Mixed
  - levels: Easy, Normal, Hard
- **Full match flow** with live scoring and automatic rule calls, shown as toasts with the rule ID and listed on the results screen
- **Modes:**
  - Override: Match 2v2, Match 1v1, Driver Skills, Free Drive
  - Pinnacle: Alliance Match, Solo Driving, Solo Coding (timer shell only for now), Free Drive
- **Deterministic replays** of your last 10 runs, with scrubbing, speed control and camera switching. Export files are named `zdrive-<game>-<mode>-<date>.json`.
- **Records:** best score per mode and career totals
- **Graphics presets** Low / Medium / High, **keyboard and gamepad** input, and a headless test suite

## Controls

Every action can be rebound in **Settings → Controls**, on both keyboard and gamepad. The defaults are:

| Action | Keyboard | Gamepad (V5 layout) |
|---|---|---|
| Drive forward / back | W / S | Sticks (split arcade, arcade or tank) |
| Strafe (holonomic) or turn (tank) | A / D | Sticks |
| Turn | Q / E or ← / → | Sticks |
| Lift up / down | R / F or ↑ / ↓ | L1 / L2 |
| Intake in / out | Space / Shift | R1 / R2 |
| Grip / release Pin | J | A |
| Grip / release Cup | K | B |
| Wrist flip | L | Y |
| Toggle / Roller tool | T | X |
| Goal auto-align (hold) | V | D-pad down |
| Feed next Match Load | G | D-pad up |
| Choose Loader | [ / ] | D-pad left / right |
| Load type: alliance Pin / yellow Pin / Cup / nested pair / other-color Pin | 1 / 2 / 3 / 4 / 5 | — |
| Start match / pause | Enter | Start |
| Restart | Backspace | Back |
| Menu | Esc | — |
| Cycle camera | C | R3 |
| Toggle 2D / 3D view | M | L3 |
| Score breakdown | Tab | — |
| Spawn a piece (Free Drive) | P | — |

On a gamepad, L1/L2 are the left bumper and trigger and R1/R2 are the right ones, the same as a V5 controller. The Controls page also sets the drive layout, stick deadzone, sensitivity curve (1.0 linear to 3.0 cubic) and trigger threshold, and shows a live readout of a connected gamepad.

## Screens and settings

- **Play:** pick a mode card (duration, rules summary, your best). The side panel sets your robot, alliance, start position (on a field map), partner and opponent bots (None, Still, or a bot with Easy, Medium or Hard difficulty and a Scorer, Toggle/Roller, Defender or Mixed style, optionally driving a copy of My Robot) and the automatic referee, then **Start**.
- **Robot:** the builder (below). Every change is kept in **My Robot**, the robot you drive; **Save robot** keeps a named copy, and presets always load as a copy.
- **Settings:** Controls (rebinding with conflict warnings, drive layout, live gamepad test), Driving (deadzone, curve, trigger threshold, speed cap, drive style, your height), Assists, Graphics (view, camera, quality Auto to Ultra, theme, performance read-out), Audio (volumes, menu sounds, mute), Accessibility (interface scale 90–130%, reduced motion, colorblind palette, clean HUD, in-match messages) and Data (export, import or clear everything). Changes apply at once.
- **Records:** career totals, a sortable best-score table, and the last 10 replays. The replay viewer has a timeline with period and rule-call markers, 0.25×–4× playback and camera switching.

## Builder guide

Open **Build robot** from the game hub. The selected game sets the constraints. Hovering or focusing a section outlines that part on the preview.

1. **Chassis.** Set the length, width and starting height, each at most 18″. The preview draws the 18″ starting cube and the expansion envelope: 24″ × 24″, with a 50″ height limit in Override and no height limit in Pinnacle.
2. **Drivetrain.**
   - Type: tank (4, 6 or 8 wheels), X-drive, mecanum, or H-drive
   - Wheels: 2.75″, 3.25″ or 4″, with omni or traction chosen for each position
   - Gearing: the cartridge (100/200/600 rpm) and an external ratio
   - Motors per side: 11 W or 5.5 W

   Top speed, turn rate (including traction-wheel scrub) and push force come from the same wheel-force model the simulator uses.
3. **Intake.** Choose a flex-wheel roller, a conveyor, or a floor claw, and mount it front, back or both. Set whether it accepts upright pieces, lying pieces, or both. A conveyor stores two pieces and feeds them to the claw.
4. **Lift.** Choose a single arm, 4-bar, DR4B, 6-bar, chain bar or cascade. Set the maximum grip height and the lift motors. Arc lifts reach forward as they rise.
5. **End effector.**
   - single claw: one piece
   - dual-grip: 1 Pin + 1 Cup
   - stack gripper: Pinnacle only

   Each can have an optional wrist that flips a Cup (which half of the Cup faces down decides what it hides) and be motor or pneumatic.
6. **Toggle / roller tool.** Choose none (push with the robot), an arm wedge, a spinner wheel, or a pneumatic flipper.
7. **Pneumatics.** Set the number of tanks and cylinders; the builder turns them into an estimated actuation budget.

The **legality panel** checks everything live:

| | Override | Pinnacle |
|---|---|---|
| Drivetrain motor power | ≤ 55 W, no PTO | no separate cap |
| Total motor power | ≤ 88 W | ≤ 99 W |

It also checks sizes and air tanks, and explains how the robot's grips and intake map to the possession or carry rule. The engine enforces that rule: an extra piece is refused and flagged. Illegal builds are blocked from matches but can still drive in Free Drive.

Saved robots live in your browser. You can rename, duplicate, delete, export and import them.

## Rules summary (what ZDrive scores and calls)

**Override** (V5RC manual v2.0)

- **Match timing:** 15 s Autonomous, then 1:45 Driver Control. The Endgame is the final 10 s.
- **Points:**
  - each Scored alliance-colored Pin half: 5
  - each Scored yellow half: 10, to its owner
  - each robot in the Midfield at the end: 8
  - Autonomous Bonus: 12, split 6/6 on a tie
- **Placed:** a Pin nested in a Goal, or in a Cup that sits on a Placed Pin, with at most one Pin half in each opening.
- **Visible:** a Pin half scores only if it isn't inside the opaque half of a Cup.
- **Yellow ownership:** in each Quadrant, yellow halves belong to the color that Quadrant's Toggle is set to (a Toggle counts only when fully seated and untouched). On the Midfield Goal, they belong to the alliance with more robots in the Midfield.
- **Calls:**
  - SG6: possession
  - SG7: crossing the Autonomous Line (flips the Autonomous Bonus)
  - SG9: opposing Alliance Goals
  - SG10: removing from neutral Goals
  - SG12: Endgame Midfield placement
  - SG13: Load Zones and opponent Loaders
  - GG17: holding
- **Results:** the Autonomous Win Point, standard or Worlds thresholds
- **Driver Skills:** 60 s, red Loaders only, with the skills scoring differences

**Pinnacle** (Achieve manual v1.2)

- **Solo:**
  - Cup on any Goal: 1
  - a colored halfpin on a matching or neutral Goal: 5
  - a yellow halfpin: 5, only when the zone's Roller matches
  - any halfpin on the center Goal: 10
- **Alliance:**
  - Rollers decide who gets the Cups and yellow halfpins on neutral Goals, and the yellow halfpins on alliance Goals
  - on the center Goal, the alliance with more colored halfpins also takes its Cups and yellow halfpins
  - parking: 21 per robot touching an own Loader, at most one robot per Loader
- **Calls:**
  - 3.3.2: carry limit
  - 5.3.1: Autonomous side
  - 5.3.4: neutral-zone removal (red card)
  - 5.3.5: opposing Goals (red card)
  - 5.3.6: holding
- **Fouls:** these escalate from warning to yellow card to red card, and a red card zeroes the team's score.
- **Results:** Autonomous and Endgame ranking points

Field geometry that the manuals don't dimension is estimated. `PROGRESS.md` lists every estimate.

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

- `npm test` runs the headless suite (`tsx tests/run.ts`, which runs every `tests/*.test.ts`), covering scoring, engine, session and bot tests.
- `npm run build` type-checks and produces `dist/`.

Source layout:

| Path | Contents |
|---|---|
| `src/shared` | input mapping, PRNG, timestep, match timer, types, storage, replay and robot formats |
| `src/engine` | deterministic Rapier simulation: drivetrain, mechanisms, nesting, loaders, match flow, violations (no DOM, no three.js) |
| `src/games/override`, `src/games/pinnacle` | the GameDefinitions: field, layouts, scoring, rules, modes |
| `src/render` | three.js scene, cameras, quality presets, builder turntable |
| `src/bots` | bot controllers (they only emit RobotCommands) |
| `src/ui` | React app |

`docs/games/*.md` holds the extracted field data.

## Deploying to Vercel

1. Import the repository in Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`. Output directory: **`dist`**.
4. Deploy. `vercel.json` rewrites every path to `index.html`, so `/override` and `/pinnacle` deep links work.

The site is fully static. The physics engine and 3D renderer are lazy-loaded when you open a field.

---

ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF. No manual text or figures are bundled with the app.
