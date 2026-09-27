# ZDrive progress

## Phases
- [ ] P1 research + cleanup + deps (cleanup/deps done; research subagent running)
- [ ] P2 engine: Rapier world, field loading, drivetrain; engine tests
- [ ] P3 objects, grasp, nesting, Override scoring/rules; tests
- [ ] P4 Pinnacle definition, scoring, rollers; tests
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

## Open TODOs / EST values
