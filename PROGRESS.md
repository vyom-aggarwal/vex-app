# ZDrive progress

## Phases
- [x] P1–P9 engine, games, bots, replays, renderer, React UI, lazy-loading (see git history)
- [x] U1 tokens (dark, light, colorblind), Inter, icons, /design
- [x] U2 components with every state on /design
- [x] U3 shell, Home hub, Mode select, Settings
- [x] U4 Robot builder
- [ ] U5 HUD, pause, toasts, Results
- [ ] U6 Records, replay viewer, states, sounds, reduced motion, gamepad audit

## Engine decisions (P1–P9)
- Deps: @types/react(-dom) (types only); @fontsource-variable/inter (self-hosted UI font, U1).
- `npm test` = `tsx tests/run.ts`. vite.config.ts only raises chunkSizeWarningLimit (Rapier WASM in the lazy engine chunk).
- Field frame: +y points to the red station. Override Autonomous Line = y = x; Quadrants L, A red; F, R blue.
- Grasp = kinematic attachment; stacks/loader pieces kinematic; riders follow their base; wrist flips single pieces.
- Goal body shields its stack: effector sweeps > 0.8 m/s through the column break it. Walls 0.3 m thick.
- Toggles/rollers: free revolute prism + bounded detent PD; tools force a detent target.
- Robot: frictionless chassis collider + per-wheel force model; mass on the chassis (COM = wheel-model origin);
  locked to the tile plane; V5 motors current-limited. Effector collider only touches Toggles/Rollers.
- Rules: SG9/5.3.5 ignore contact while shoved; touch = exact overlap (+0.15 in); red card zeroes the carded team.
- Replays: seed + specs + quantized player commands + HP loads; bots re-created; 10 s Rapier snapshots for seeking.
- Live score hides end-of-match position points until the endgame.

## UI decisions (U1–U6)
- Accent: lime green #a6e35a (light theme #3d7f0f). Red/blue only mean alliance; danger is orange-red + octagon icon.
- Tokens are rem-based: the UI scale setting (90–130%) sets the root font size. Theme/palette/motion = data-* on <html>.
- Colorblind palette: vermillion / sky / yellow (Okabe–Ito based). Reduced motion: travel → 0, fades stay.
- Nav layer (src/ui/nav.ts): gamepad D-pad/stick = spatial focus in the top `data-nav-scope`, A click, B back,
  LB/RB tabs, X/Y/Start screen shortcuts; Esc = back, [ ] = tabs. Components get synthetic arrow keys first.
- One canvas, owner stack (host.ts): menu backdrop ← builder / match / replay; release hands it back. Backdrop
  orbits at ~30 fps, still under reduced motion; field colors come from the tokens (renderer.setPalette).
- Routes: /:game (hub), /:game/play, /:game/robot, /:game/records, /:game/settings/:section, /design.
  Old /configure/* links redirect. Router stores scroll + focus per history entry (Back restores both).
- Settings nav adds "Audio" to the six listed sections (sounds had no other home). Match setup (alliance, start,
  bots, referee) moved into the Mode select side panel.
- Home card shortcuts: Play P / Start, Configure C / X, Records R / Y.
- Builder: presets load as a copy into My Robot (never edited); Save updates the saved robot it came from, Save as
  new makes another. Unsaved My Robot asks before a load. Hovering/focusing a group outlines that part (Box3 helper).
- Legality messages (engine/legality.ts) now name the fix ("Drivetrain is 66 W; cap is 55 W. …").
- Legacy screens still being migrated are wrapped in .zd-legacy (legacy.css, tokens only; deleted in U6).

## Open TODOs
- Pinnacle Solo Coding is a timer/mode shell only (no routine editor yet). Inspire hook: `INSPIRE_ROBOTS_PER_TEAM`.
- Renderer/UI verified by type-check + build only (no browser runs, per spec rules).
- Bot replays depend on bot code: a change to src/bots invalidates older replays that include bots.

## EST values (not dimensioned in the manuals, or tuned)
- Override: loader center x ±68.3, heights 14.37/22.97; Load Zones |x|≥46.6, |y|≥58.5; Midfield |x|+|y|≤22.72;
  Auto Line tape 2.5; cross-arm offset 4.75; toggle overhang 0.4 + face order; neutral footprints; loader capacity 6.
- Pinnacle: all coordinates; interior 140.4; roller 25.6 long at 13.2, face order, starts yellow; goal/pin/cup/loader
  sizes (Override values); cup up-sides; start areas; "pinnacle" = 1 Cup + 1 Pin unit; no pause between periods.
- Physics: piece masses 0.06/0.05 kg; pin insert 2.93; snap 1.25 in; 0.75 s placement grace; break speed 0.8 m/s.
- Motors/mechanisms: V5 stall 2.1 N·m @100 rpm (5.5 W = half); wheel μ; mass model; lift ~14 in/s per 11 W;
  wrist/claw timing; ~30 air strokes/tank; tool reach/timing.
- Rules: load delay 1 s; SG13 lingering 3 s; SG7 1 in slack; holding-detection heuristic.
