# ZDrive progress

## Phases
- [x] P1 research + cleanup + deps
- [x] P2 engine: Rapier world, field loading, drivetrain; engine tests
- [x] P3 objects, grasp, nesting, Override scoring/rules; tests
- [x] P4 Pinnacle definition, scoring, rollers; tests
- [x] P5 match flow, loaders, violations, skills/solo; session + replay tests
- [x] P6 three.js renderer, cameras, quality, 2D view, input wiring
- [x] P7 React UI + branding (bots were written first because the Play screen needs them)
- [x] P8 bots, replays, records
- [x] P9 lazy-loading, README, final `npm test` (36 pass) + `npm run build`

## Decisions
- Extra dev deps: @types/react, @types/react-dom (types only, for TSX).
- `npm test` = `tsx tests/run.ts`, which imports every tests/*.test.ts (npm on Windows doesn't expand globs).
- vite.config.ts only raises chunkSizeWarningLimit: Rapier compat embeds its WASM as base64 in the lazy engine chunk.
- Field frame: docs/games use +x toward blue; src/games rotate (x,y) → (y,−x), so +y points to the red station.
- Override Autonomous Line = the y = x diagonal (red side y > x). Quadrants L and A are red; F and R are blue.
- Grasp = kinematic attachment to the effector point (a rigid fixed joint without solver jitter).
- Stacks and presented loader pieces are kinematic. Riders (a Pin in a Cup) follow their base. The wrist flips single pieces only.
- The goal body shields its stack, so a fast effector sweep through the stack column (> 0.8 m/s) breaks it.
- Toggles/rollers: a free revolute prism plus a bounded-torque detent PD. Tools force a detent target.
- Wall colliders are 0.3 m thick outward, so nothing tunnels through.
- Robot chassis: a frictionless collider plus the per-wheel force model (drivetrain.ts), shared with the builder stats.
- SG9 / 5.3.5 ignore contact while an opponent is touching the robot (being shoved in isn't interacting).
- Pinnacle 5.3.1 "opponent side" = past the field centerline. Rollers count by seated color; robot contact is ignored.
- Red card zeroes the carded team's score (solo total; the player's record in alliance matches).
- Replays store seed + specs + the player's quantized commands (1/100) + HP loads. Bots are deterministic and re-created
  on playback; their brain state and the sim's contact facts go into the 10 s in-memory Rapier snapshots used for seeking.
- Toggle/roller tool press: steps toward your own color; from your own color it steps back to yellow.
- Lying pieces picked up by the claw or intake are righted with the end pointing away from the robot on top.

## Open TODOs
- Pinnacle Solo Coding is a timer/mode shell only (no routine editor yet). Inspire hook: `INSPIRE_ROBOTS_PER_TEAM`.
- Renderer/UI was verified by type-check + build only (no browser runs, per spec rules).
- Bot replays depend on bot code: a change to src/bots invalidates older replays that include bots.

## EST values (not dimensioned in the manuals, or tuned)
- Override:
  - loader center x ±68.3
  - loader heights 14.37 / 22.97 (lowered/raised)
  - Load Zone bounds |x| ≥ 46.6, |y| ≥ 58.5
  - Midfield inner edge |x|+|y| ≤ 22.72
  - Autonomous Line tape 2.5 wide
  - cross-arm pin offset 4.75
  - toggle overhang 0.4 in and face order (+120° shows the opposing color)
  - neutral-goal footprints
  - loader capacity 6
- Pinnacle:
  - every coordinate
  - field interior 140.4
  - roller length 25.6, height 13.2, face order, starting yellow
  - goal, pin, cup and loader sizes (Override values used)
  - which side of each cup is up
  - start areas
  - "pinnacle" = 1 Cup + 1 Pin unit
- Physics:
  - piece masses 0.06 / 0.05 kg
  - pin insert 2.93 (collar rests on the rim)
  - snap radius 0.6 in, window +3.5 / −1.2 in
  - break speed 0.8 m/s
  - detent gains and torque caps
- Motors and mechanisms:
  - V5 stall torque 2.1 N·m at 100 rpm (5.5 W = half)
  - wheel friction μ and rolling resistance
  - mass model
  - lift speeds (~14 in/s per 11 W)
  - wrist/claw timings
  - pneumatic budget ~30 strokes/tank
  - tool reach/timing
- Rules and timing:
  - load delay 1 s
  - SG13 lingering 3 s
  - SG7 1 in line slack
  - holding detection heuristic
  - Pinnacle alliance has no pause between periods
