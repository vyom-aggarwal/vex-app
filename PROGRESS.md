# ZDrive progress

## Phases
- [x] P1 research + cleanup + deps
- [x] P2 engine: Rapier world, field loading, drivetrain; engine tests
- [x] P3 objects, grasp, nesting, Override scoring/rules; tests
- [x] P4 Pinnacle definition, scoring, rollers; tests
- [ ] P5 match flow, loaders, violations, skills/solo
- [ ] P6 three.js renderer, cameras, quality, 2D view, input
- [ ] P7 React UI + branding
- [ ] P8 bots, replays, records
- [ ] P9 lazy-loading, README, final checks

## Decisions
- Extra dev deps: @types/react, @types/react-dom (TSX typing for React; types only, no runtime).
- `npm test` = `tsx tests/run.ts`, a runner that imports every tests/*.test.ts (npm on Windows won't expand globs).
- Kept from prototype: shared/prng.ts (mulberry32), shared/input/* (drive modes, deadzone, curves).
- No vite.config existed; Vite defaults used (tsconfig jsx: react-jsx).

- Field frame: docs/games use +x toward blue; src/games rotate (x,y)->(y,-x) so +y = red station.
- Override Autonomous Line is the y = x diagonal (red side y > x); quadrants L/A red, F/R blue.
- Grasp = kinematic attachment to the effector point (behaves as a rigid fixed joint, no solver jitter).
- Stacks/loader pieces are kinematic; riders (pin in cup) follow their base; wrist flips single pieces only.
- Toggles/rollers: free revolute prism + engine detent torque (handles wrap); tools force a detent target.
- Robot chassis: frictionless collider + per-wheel force model (drivetrain.ts), shared with builder stats.
- Pinnacle 5.3.1 "opponent side": interpreted as past the field centerline (EST).
- Stacks can't be rammed through the goal body, so a fast effector sweep through a stack column breaks it.
- Pinnacle rollers reuse the toggle prism; seated color counts (robot contact ignored, EST). Red card zeroes the team.
- Replay snapshots (Rapier) kept in memory only; saved replays = seed + specs + inputs (localStorage size).

## Open TODOs / EST values
- EST: loader center/heights, Load Zone bounds, Midfield inner edge 22.72, cross-arm offset 4.75,
  toggle overhang 0.4 in / face order, piece masses, insertion depths, snap radius 0.6, break speed 0.45 m/s,
  loader capacity 6 (Override), load delay 1 s, lingering 3 s, lift speeds, pneumatic budget, all Pinnacle coords.
