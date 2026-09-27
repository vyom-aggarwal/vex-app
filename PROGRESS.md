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

- Robots are locked to the tile plane (Z, roll, pitch) and re-pinned each step; the lift's effector collider only
  touches Toggles/Rollers. This fixed robots climbing/bouncing on goals and pieces.
- Touch detection for rules = exact overlap query (colliders +0.15 in); Rapier manifold distances were unreliable.
- UI follows DSim's structure (sidebar Home/Play/Configure/Records; Configure: Robot, Controls, Match, Audio and
  visual, Graphics) with original code and design. Rebindable controls; My Robot draft auto-saves.
- Live score hides end-of-match position points (parking, Midfield robots) until the endgame; the final score counts them.

## Open TODOs
- Pinnacle Solo Coding is a timer/mode shell only (no routine editor yet). Inspire hook: `INSPIRE_ROBOTS_PER_TEAM`.
- Renderer/UI was verified by type-check + build only (no browser runs, per spec rules).
- Bot replays depend on bot code: a change to src/bots invalidates older replays that include bots.

## EST values (not dimensioned in the manuals, or tuned)
- Override: loader center x ±68.3, heights 14.37/22.97; Load Zones |x|≥46.6, |y|≥58.5; Midfield |x|+|y|≤22.72;
  Auto Line tape 2.5; cross-arm offset 4.75; toggle overhang 0.4 + face order; neutral footprints; loader capacity 6.
- Pinnacle: all coordinates; interior 140.4; roller 25.6 long at 13.2, face order, starts yellow; goal/pin/cup/loader
  sizes (Override values); cup up-sides; start areas; "pinnacle" = 1 Cup + 1 Pin unit; no pause between periods.
- Physics: piece masses 0.06/0.05 kg; pin insert 2.93; snap 0.9 in (tip/opening geometry; +3.5/−1.2 window); break speed 0.8 m/s; detent gains/caps.
- Motors/mechanisms: V5 stall 2.1 N·m @100 rpm (5.5 W = half); wheel μ, rolling resistance; mass model; lift ~14 in/s
  per 11 W; wrist/claw timing; ~30 air strokes/tank; tool reach/timing.
- Rules: load delay 1 s; SG13 lingering 3 s; SG7 1 in slack; holding-detection heuristic.
