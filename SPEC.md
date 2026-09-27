# ZDrive — build spec (read fully before acting)

GOAL
Turn this repo (currently a 2D Override prototype) into a DSim-style (playdsim.com) 3D driver-practice
simulator for two 2026-27 games that share the same Pins and Cups:
  - VEX V5RC Override
  - RECF Achieve Pinnacle
There is a game switcher, like DSim's DECODE / Chain Reaction / BIOBUZZ tabs. The site is static and hosted on Vercel.
Use DSim as a feature/UX reference only. Do NOT read or copy its source (PolyForm Noncommercial license).

Match or beat these DSim features:
- per-game home (Play / Configure / Records)
- 3D view plus a 2D top-down view
- robot builder with a live 3D turntable preview, saved robots and presets
- alliance-perspective driver camera plus other cameras
- field-centric and robot-centric drive, and driver assists
- partner and opponent bots with difficulty levels
- full match flow with live scoring and automatic rule-violation calls
- skills/solo modes and free drive
- deterministic replays, local records and career stats
- graphics quality presets
- keyboard and gamepad input
- headless test suite
Do not bundle any manual text or figures in the app.

NAME AND BRANDING
The app is called ZDrive. Use that exact capitalization everywhere a user can see it.
- <title> on the home page: "ZDrive: VEX Driving Simulator"
- <title> on game pages: "ZDrive · Override" and "ZDrive · Pinnacle"
- Wordmark at the top of the home page and in the in-game header: "ZDrive"
- Tagline under the wordmark: "3D driver practice for VEX Override and RECF Pinnacle"
- Favicon: a simple original "Z" mark. No VEX or RECF logos anywhere.
- Meta description: "ZDrive is a free 3D driving simulator for VEX V5RC Override and RECF Pinnacle.
  Build a robot, drive full matches against bots, and track your records."
- Also set og:title and og:description (text only; no og:image yet).
- package.json "name": "zdrive"
- Prefix every localStorage key with "zdrive:" (e.g. "zdrive:settings", "zdrive:robots:override").
- Replay export files: "zdrive-<game>-<mode>-<date>.json".
- Robot JSON export strings start with "ZDRIVE1:" so imports can check the format version.
- Footer: "ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF."

## 0. Working rules (token discipline)
- Maintain PROGRESS.md (max 60 lines): phase checklist, decisions, open TODOs. Each session, read only SPEC.md,
  PROGRESS.md and the files needed for the current phase.
- Don't ask me questions. Decide, and log the decision in PROGRESS.md.
- Do research only as described in §3, inside a subagent that returns only extracted data. Never re-research.
- Allowed deps: react, react-dom, three, @types/three, @dimforge/rapier3d-compat, tsx (dev). Adding anything
  else requires a one-line justification in PROGRESS.md.
- Never read node_modules, lockfiles or dist. For library APIs, grep the specific symbol in the .d.ts.
- Write each file completely, once. Fix with targeted edits, not rewrites.
- Verify with `npm test` (headless) and `npm run build` only. Never start a dev server or open a browser.
- Run `git init` if needed. Commit at the end of every phase.
- Keep chat output to 5 lines or fewer per phase.

## 1. Existing code
List src/ and scripts/ first. Don't open files you're about to delete.
- DELETE: the Canvas 2D renderer, the vanilla DOM menus/HUD/CSS, the custom 2D physics, src/sim/fieldConfig.ts,
  and ALL invented Override field values and scoring.
- MOVE to src/shared/ and keep: the pure input mapping (drive modes, deadzone, curves, keyboard/gamepad),
  the fixed-timestep loop, the seeded PRNG, and the match-phase timer.
- REWRITE: scripts/smoke.ts (becomes tests/, see §9), README.md, index.html, vercel.json (SPA rewrite so
  /override and /pinnacle deep links work). Rename all user-facing strings from the old prototype to ZDrive.
  If the old prototype stored anything in localStorage, ignore it; don't migrate it.
- KEEP: vite config, tsconfig, package.json (add the new deps).

## 2. Architecture
src/shared/    input, prng, timestep, types (RobotCommand, RobotSpec), replay format, storage
               (localStorage wrapped in try/catch)
src/engine/    game-agnostic deterministic sim: Rapier world, robot and drivetrain model, mechanism model,
               nesting/stack model, loaders, match flow, violation framework.
               No DOM, no clock, no three.js imports.
src/games/override/, src/games/pinnacle/
               each exports a GameDefinition:
               - field geometry and starting object layout
               - loader and human-player rules
               - scoring(state), a pure function
               - violation checks
               - match timings and modes
               - builder constraints
               - bot strategy hints
src/render/    three.js scene built from the GameDefinition and state; cameras; quality presets.
               The 2D view is an orthographic top camera with flat materials.
src/bots/      controllers that only emit RobotCommands.
src/ui/        React: routes, game switcher, menus, builder, HUD, results, records, replay viewer.
Engine rules:
- The engine consumes one RobotCommand per robot per tick, plus a seeded PRNG.
- Fixed 120 Hz step; rendering interpolates between steps.
- State is serializable.
- A replay is seed + robot specs + per-tick commands, with a Rapier snapshot every 10 s as a fallback.
- Lazy-load three, rapier and each game (dynamic import) so the home page loads fast.
- Internal units are meters; game definitions are in inches; convert at the boundary.

## 3. Research (one subagent, at most ~12 fetches)
Output:
- docs/games/override.md and docs/games/pinnacle.md
- A coordinate table (inches, origin at field center, +y toward the red alliance station) covering every
  field element and every starting object: position, upright or lying, which half is up.
- Cite the source figure for each row, and mark any estimate as EST.

Override:
- Download https://content.vexrobotics.com/docs/2026-2027/override/files/override-2.0.pdf
- Extract text from the Appendix A pages only (pdftotext -f/-l, or pypdf) and grep for dimensions.
- If dimensions exist only in drawings, render just those pages at low DPI (pdftoppm -r 60) and view them.
- Needed:
  - goal positions and footprints
  - Toggle geometry (Fig A8), mounts and starting orientation
  - Loaders, Load Zones, Alliance Stations
  - Midfield tape, Autonomous Line, Quadrant boundaries
  - starting positions of all objects (Fig FO-2)
  - Skills setup (Fig RSC4-1)
  - Pin and Cup dimensions (A5/A6; resolve the pin diameter vs. hex base)
  - AprilTag IDs (A16)
  - pneumatics limits (R25)

Pinnacle:
- Fetch https://games.recf.org/achieve/1.2 with a prompt asking only for the Game-Specific Definitions:
  halfpin, visible, nested, stack, pinnacle, roller, loader, zones, supply.
- Download and view these figures:
  https://games.recf.org/manuals/uploads/a793ff6f-b620-4583-8511-f2c6eac29a9f.png (1.5.1 objects)
  https://games.recf.org/manuals/uploads/c1b8c130-d2db-41d4-9081-733c34440f7b.png (1.5.2 zones)
  https://games.recf.org/manuals/uploads/14a6bda2-8003-4904-9912-d6722ad0510b.png (3.0.1 solo setup)
  https://games.recf.org/manuals/uploads/c22eec48-8ce8-43a6-9587-95c6e9672345.png (3.0.2 solo setup)
  https://games.recf.org/manuals/uploads/9ff7c76d-19c8-4292-9109-fbc92d3016e6.png (5.2.2 alliance start)
  https://games.recf.org/manuals/uploads/215d6b3d-bee1-4ee1-afd0-4ac46fb63c70.png (7.3.2 field/rollers)
- Needed: the same list as Override, plus roller geometry, how a roller is turned, its colors and starting
  colors, and zone boundaries.
- If a definition can't be found, use the Override equivalent and mark it EST.

## 4. Override: V5RC Game Manual v2.0 (effective Sept 10 2026). VERIFIED, implement exactly.
MATCH
- 15 s Autonomous, then 1:45 Driver Controlled. Endgame = the final 10 s.
- Score the state at 0:00.

OBJECTS
- 56 Cups:
  - 20 Match Loads (10 per alliance)
  - 24 on the field gray-side-up
  - 12 on the field clear-side-up
- 63 Pins:
  - 4 red/blue, all on the field
  - 20 red/yellow: 2 preloads, 10 match loads, 8 on the field
  - 20 blue/yellow: same split as red/yellow
  - 19 yellow/yellow: 2 match loads, 17 on the field
- Cup: hourglass, 6.48" tall, about 3.15" diameter, one transparent half and one opaque half.
- Pin: 6.5" tall, two halves.

ELEMENTS
- 9 octagonal Goals:
  - 2 red and 2 blue Alliance Goals (3.25" tall)
  - 4 short neutral Goals (5.77" tall)
  - 1 tall Midfield Goal (8.77" tall)
- 4 Toggles, one at the center of each wall.
- 4 Loaders, two adjacent to each Alliance Station, each with a Load Zone.
- Each Quadrant contains 1 Alliance Goal, 1 short neutral Goal and 1 Toggle.
- The tall Goal sits in the Midfield and belongs to no Quadrant.
- The Midfield boundary is the inner edges of the white tape.

POINTS
- Autonomous Bonus: 12
- each Scored alliance-colored pin half: 5
- each Scored yellow half: 10
- each Robot ending in the Midfield: 8

SC2 (Placed)
- A Pin is Placed if both are true:
  - it is nested with a Goal, or with a Cup that is itself nested with a Placed Pin;
  - each Goal and each Cup half nested with that Pin contains at most ONE Pin half.
- A Cup is Placed if it is nested with a Placed Pin.
- "Nested" means a Pin half breaks the plane of a Cup or Goal opening.
- Robot contact doesn't cancel Placed status.

SC3 (Scored halves)
- Each visible half of a Placed Pin scores: red half → red, blue half → blue, yellow half → its owner.
- Visible = not even partly inside the OPAQUE half of a Cup.

SC4 (Toggle state)
- A Toggle counts as set only when it is fully seated in one of 3 discrete states (red, yellow, blue) AND
  no Robot is touching it.
- Otherwise it counts as yellow.

SC5 (Yellow ownership)
- In a Quadrant, the owner is the color of that Quadrant's Toggle.
- On the Midfield Goal, the owner is the alliance with more Robots in the Midfield. A tie means no owner.

SC6 (In the Midfield)
- A Robot counts if any part of it extends into the Midfield volume.

SC7 (Autonomous Bonus)
- Excludes points that depend on Midfield position.
- A tie gives 6 to each alliance.
- Any Autonomous violation gives the Bonus to the opponent. If both alliances violate, nobody gets it.

SC8 (Autonomous Win Point; show in the results screen)
- Standard events: all of these at the end of Autonomous:
  - at least 6 Pins Scored for the alliance
  - at least 2 Goals, each with at least 2 of the alliance's Scored Pins
  - Pins and Goals in Quadrants across the Autonomous Line don't count
  - neither Robot touching the perimeter
  - no Autonomous violations
- Worlds-qualifying events (toggle in settings): 7 Pins and 3 Goals instead.

SG1 (Starting a Match)
- Robot is at most 18x18x18.
- Robot touches the tiles and the perimeter on its own side of the Autonomous Line.
- No two Robots share a Quadrant.
- Robot doesn't touch Goals, Loaders, Load Zones or Toggles.
- Preload is 1 Pin: red/yellow for red, blue/yellow for blue.

SIZE AND POSSESSION
- SG2: footprint at most 24x24 at all times.
- SG3: height at most 50".
- SG6: Possession is at most 1 Pin and 1 Cup. Possession means the object is fully supported, or controlled
  in every direction of movement. Floor-pushing that loses control is not Possession.

INTERACTION RULES
- SG7: During Autonomous, no contact with tiles, objects or elements across the Autonomous Line. The 28
  objects that start on the line may be used by either alliance.
- SG9: No interaction at all with opposing Alliance Goals, or with anything stacked on them.
- SG10: Never remove Placed objects from neutral Goals. Knocking them off counts as removal.
- SG11: Match Loads may be added only during Driver Control, only through your own Loaders, only via the
  top or back. Pieces may go in separately or nested. They leave through the Loader bottom.
- SG12: During the Endgame, nobody may Place objects on the Midfield Goal.
- SG13: During Driver Control:
  - don't contact an opponent that is partly inside its own Load Zone;
  - don't linger in an opponent's Load Zone;
  - don't touch opponent Loaders.
- GG17: Holding (trap, pin or lift) is allowed for at most a 3-count.
  - The count pauses at 2 ft of separation.
  - After it pauses, a 5-count must pass before holding again.

ROBOT RULES
- R10: total motor power at most 88W. V5 Smart Motors are 11W or 5.5W.
- R11: drivetrain motors total at most 55W, and they may not power other mechanisms (no PTO).

SKILLS (RSC)
- 60 s. Start in the Quadrant adjacent to the red Alliance Station, with a red/yellow Preload.
- Match Loads may be added at any time, through red Loaders only: 3 red/yellow Pins, 4 blue/yellow Pins,
  7 Cups.
- All Goals start empty. The Robot may add or remove objects anywhere.
- Scoring differences:
  - red halves score only in red Quadrants or the Midfield; blue halves only in blue Quadrants or the Midfield
  - yellow halves score only if Owned
  - a Toggle gives Ownership only when set to its own Quadrant's color
  - Midfield yellow is Owned if the Robot ends in the Midfield
- Point values are 5 / 10 / 8.

## 5. Pinnacle: RECF Achieve Game Manual v1.2 (Jul 28 2026). VERIFIED.
Program: Achieve (middle and high school). One robot per team; alliance matches are 2 teams vs 2 teams.
(Inspire, the college version where each team runs 2 robots, is a later add-on. Just leave a hook for it.)

MATCH TYPES
- Solo Driving: 60 s
- Solo Coding: 60 s, no controller (build only the timer and mode shell for now)
- Alliance: 120 s total, starting with 15 s Autonomous. Verify the timer split.

FIELD
- Zones: red zone (2 red Goals), blue zone (2 blue Goals), neutral zone, center zone (center Goal).
- The neutral zone holds 3 Goals: neutral 1, neutral 2 and center.
- Rollers sit in the red zone, neutral zone 1, neutral zone 2 and the blue zone. The center Goal has no roller.
- 4 Loaders, 2 per alliance. Red and blue driver boxes.

OBJECTS (solo setup)
- Cups: 56 total = 20 in the red box supply + 20 in the blue box supply + 16 on the field.
- red/blue Pins: 4, all on the field.
- red/yellow Pins: 20 = 2 red preloads + 10 red supply + 2 blue supply + 6 on the field.
- blue/yellow Pins: 20 = 2 blue preloads + 10 blue supply + 2 red supply + 6 on the field.
- yellow/yellow Pins: 19 = 7 red supply + 7 blue supply + 5 on the field.
- The alliance setup follows Fig 5.2.2.

NESTING
- A Pin is scored if it is nested into a Goal or into a scored Cup.
- A Cup is scored if it is nested onto a scored Pin.
- A scored Pin worth 0 points still counts as scored for nesting.
- A "pinnacle" is a stack of exactly 1 Cup + 1 Pin.

SOLO SCORING (per visible halfpin)
- Cup on any Goal: 1
- red halfpin on a red or neutral Goal: 5
- blue halfpin on a blue or neutral Goal: 5
- yellow halfpin on a red or neutral Goal: 5, only if that zone's roller is red
- yellow halfpin on a blue Goal: 5, only if that zone's roller is blue
- any halfpin on the center Goal: 10

ALLIANCE SCORING
- Alliance Goals:
  - own-color halfpin: 5 to the owner
  - each Cup: 1 to the owner
  - yellow halfpin: 5 to the alliance whose color the zone roller shows, which CAN be the opponent
  - opposite-color halfpins: 0
- Neutral Goals:
  - each alliance gets 5 per visible halfpin of its color
  - Cups (1 each) and yellow halfpins (5 each) go to the alliance the roller shows
  - a yellow roller gives them to nobody
- Center Goal:
  - 10 per visible alliance-colored halfpin, to that alliance
  - the alliance with MORE visible alliance-colored halfpins there also gets 1 per Cup and 10 per yellow halfpin
  - a tie gives those to nobody
- Parked: 21 per robot touching one of its alliance's Loaders at the end, max 1 robot per Loader.

MATCH RULES
- 3.3.2 carry limit: at most 1 unstacked Pin, 1 unstacked Cup and 1 stack of any height at the same time.
- Start: at most 18x18x18, touching one of your own alliance's Loaders (in solo, one of the red Loaders).
  Preload is a yellow/red Pin for red; assume blue/yellow for blue.
- Loaders:
  - hold 1 Cup, 1 Pin or 1 pinnacle at a time
  - the drive team loads them from its own box's supply
  - solo: any time during the match, and one member may also use the blue box and blue Loaders
  - alliance: during both periods, but not before Autonomous starts and not during the pause between periods
- 5.3.1: during Autonomous, don't contact anything on the opponent's side of the neutral zone.
- 5.3.4, the 3 neutral-zone Goals:
  - anyone may add objects at any time
  - during the first 90 s, only a single TOP object (Pin, Cup or pinnacle) may be removed
  - during the final 30 s, nothing may be removed
  - breaking this = red card
- 5.3.5: no interaction with opposing alliance Goals. Breaking this = red card.
- 5.3.6: hold at most a 4-count.
- Fouls escalate: warning → yellow card → red card. A red card zeroes that team's score.

ROBOT RULES
- Start at most 18x18x18; footprint at most 24x24 during the match; NO height limit.
- Motors: at most 99W total (11W and 5.5W). No separate drivetrain cap.
- Pneumatics: at most 100 psi, no compressors.

RANKING POINTS (show in the results screen)
- Autonomous RP, at the end of Autonomous:
  - at least 3 Cups and 4 halfpins scored, across at least 2 Goals
  - own zone's roller showing own color
- Endgame RP, at the end of the match:
  - a stack with at least 5 scored, visible own-color halfpins
  - at least 1 roller showing own color
  - at least 1 robot touching an own Loader
- Win = 2 points, tie = 1.

## 6. Physics and manipulation
- Use Rapier 3D at 120 Hz. Let bodies sleep.

Field:
- Tiles and walls: friction colliders.
- Goals: octagonal colliders.
- Toggles and rollers: bodies on revolute joints with 3 detents, plus a helper that reads which detent is
  seated.

Drivetrain:
- Motor model per V5 cartridge (100/200/600 rpm free speed, stall torque; 5.5W motors are half-power).
- Wheel forces; omni vs. traction lateral grip; turning scrub.
- Tank, X-drive, mecanum and H-drive.
- Default robot's tank turn rate: about 300–350°/s.

Mechanisms:
- Kinematic colliders parented to the chassis.
- Lift height, arm angle and wrist are state variables driven by the motor model, clamped to limits.

Objects:
- Dynamic bodies. Pin = hex prism; Cup = compound approximating the hourglass. They can be upright or lying.

Grasp:
- When the gripper closes on an object that is inside the capture volume and within orientation tolerance,
  attach it with a fixed joint.
- Intakes pull objects inside their capture zone toward the storage slot.
- Enforce each game's possession/carry limit IN THE ENGINE. An extra object is refused (pushed away) and
  flagged as a violation.

Nesting:
- Keep a logical stack model per Goal: an ordered list of objects, each with which half faces down.
- When a released object's axis is within about 0.6" (EST) of an opening and moving down, snap it in.
- An intact stack is one kinematic compound.
- An impulse above a threshold breaks the stack from the struck level upward into dynamic bodies.
- Scoring reads ONLY the logical model.
- A wrist can flip a Cup, which decides which half hides the Pin half next to it.

## 7. Robot builder (constraints come from the selected game)
BODY AND DRIVE
- Chassis: length, width and starting height (each ≤18). Preview the expansion envelope (24x24; height 50"
  for Override, unlimited for Pinnacle).
- Drivetrain: tank (4/6/8 wheels), X-drive, mecanum or H-drive.
  - wheels: 2.75, 3.25 or 4", omni or traction per position
  - cartridge and external ratio
  - motors per side, each 11W or 5.5W
  - show derived top speed (ft/s), pushing force and turn rate

MECHANISMS
- Intake: none, flex-wheel roller, chain/roller conveyor, or floor claw. Mount front, back or both. Set
  whether it can take upright and/or lying objects.
- Lift: none, single arm, 4-bar, DR4B, 6-bar, chain bar on an arm, or cascade/linear. Set max height and
  assign motors.
- End effector:
  - single claw (one piece at a time)
  - dual-grip (1 Pin + 1 Cup)
  - stack gripper (Pinnacle only)
  - optional wrist flip
  - motor-driven or pneumatic
- Toggle/roller tool: none (push with the chassis), arm wedge, spinner wheel, or pneumatic flipper.
- Pneumatics: number of tanks and cylinders, turned into an actuation budget (EST, after the R25 check).

LEGALITY PANEL
- Live power sums against the game's caps (Override: drive ≤55W and total ≤88W; Pinnacle: total ≤99W).
- Size checks, and how the robot's capacity maps to the game's possession/carry rule.
- Illegal builds are blocked from Match mode. Free Drive allows them, with a warning.

PRESETS (per game)
- Starter clawbot
- DR4B dual-grip stacker
- Chain-bar with wrist flipper
- Conveyor intake feeding a claw
- Fast X-drive for toggles/rollers and defense
- Pinnacle stack carrier

SAVED ROBOTS
- Store in localStorage. Rename, duplicate, delete, and export/import as a JSON string.

PREVIEW
- A turntable using the SAME render code as matches, in ONE WebGL context.
- Build thumbnails by capturing frames from the live preview.

## 8. Modes, bots, replays, records
MODES
- Override: Match (2v2 with bots, or 1v1), Driver Skills, Free Drive.
- Pinnacle: Alliance Match, Solo Driving, Free Drive.
- Free Drive: no timer, reset the field, a hotkey to spawn a chosen object.

HUMAN-PLAYER LOADING
- A button feeds the next Match Load (choose Pin color, Cup, or nested pair) into a chosen Loader.
- Obeys each game's loading rules. 1 s delay between loads (EST).

BOTS
- Styles: Scorer, Toggle/Roller controller, Defender, Mixed.
- Levels: Easy, Normal, Hard.
- Bots can be partners or opponents. They use the player's build or a preset.
- They obey the rule checks (e.g., never touch opposing alliance Goals).
- A watchdog backs a bot out of any standstill longer than 1.5 s.

VIOLATIONS
- Detected automatically:
  - possession/carry limit
  - Autonomous side violations
  - touching opposing alliance Goals
  - neutral-goal removal (each game's version)
  - Override Endgame Midfield placement
  - Override Load Zones
  - holding counts (3-count for Override, 4-count for Pinnacle)
- Show each call as a toast with its rule ID; list them all in the results screen.
- Apply the consequences: Autonomous Bonus flip, red-card zero.
- Auto-ref can be switched on or off.

REPLAYS AND RECORDS
- Keep the last 10 runs as replays, with scrub and camera switching.
- Records: best score per game and mode, plus career totals.

## 9. Tests (`npm test` runs tsx tests/*.ts)
OVERRIDE
- Each Cup orientation case.
- The SC2 one-half-per-Goal/Cup-half rule (an object violating it is not Placed).
- Toggle states, including a Toggle touched by a robot counting as yellow.
- Midfield ownership, including ties.
- Autonomous Bonus tie and violation cases.
- AWP, standard and Worlds versions.
- Skills scoring differences.

PINNACLE: reproduce every manual example exactly
Solo:
- (1) blue Goal, roller red or yellow: 6 Cups, 3 blue halfpins, red and yellow halfpins present → 21
- (2) blue Goal, roller blue: 6 Cups, 3 blue, 3 yellow → 36
- (3) neutral Goal, roller yellow: 4 Cups, 2 red, 1 blue, yellows present → 19
- (4) neutral Goal, roller red: 4 Cups, 2 red, 1 blue, 2 yellow → 29
- (5) center Goal: 5 Cups, 6 visible halfpins → 65
Alliance (red / blue):
- F1: blue Goal, roller yellow: 6 Cups, 3 blue, yellows present → 0 / 21
- F2: blue Goal, roller blue: 6 Cups, 3 blue, 3 yellow → 0 / 36
- F3: blue Goal, roller red: 6 Cups, 3 blue, 3 yellow → 15 / 21
- F4: neutral Goal, roller yellow: 2 red, 1 blue, Cups and yellows present → 10 / 5
- F5: neutral Goal, roller red: 2 red, 1 blue, 4 Cups, 2 yellow → 24 / 5
- F6: center Goal: 2 red, 1 blue, 5 Cups, 3 yellow → 55 / 10
- F7: center Goal: 2 red, 2 blue, Cups and yellows present → 20 / 20
Also:
- Parking capped at one robot per Loader.
- Both RP checks.

ENGINE
- Spawn counts per game and mode.
- Top speed within 5% of the builder's derived value.
- Turn rate with scrub.
- Collisions.
- Possession/carry enforcement.
- Loader rules.
- Match phase timings.
- Determinism: same seed + same commands → identical state hash after 3000 ticks.
- Builder legality for each game's caps.
- Robot export/import round-trip, including rejecting strings without the "ZDRIVE1:" prefix.

## 10. Controls, cameras, settings
- Keep the existing drive-mode and deadzone code.
- Add bindings: lift up/down, grip Pin, grip Cup, wrist flip, intake in/out, toggle/roller tool, load
  next Match Load / choose Loader, cycle camera, reset.
- The default gamepad layout mimics the V5 controller (L1/L2/R1/R2 map to bumpers and triggers).
- Show a controls table in Settings.
- Cameras: Driver Station, Driver Station (tracking), Chase, Overhead 2D, Audience. C or R3 cycles.
- Assists, each toggleable: goal auto-align, auto-grab, auto-place-when-aligned, toggle/roller helper.
- Graphics: Low / Medium / High (shadows, antialiasing, pixel ratio).
- Everything saves to localStorage under the "zdrive:" prefix.

## 11. Phases (commit and update PROGRESS.md after each)
P1  Research subagent → docs/games/*.md; clean up the repo per §1; add deps; set the package name to "zdrive".
P2  Engine: Rapier world, field loading from GameDefinition, drivetrain/motor model; engine tests.
P3  Objects, grasp, nesting/stack model, Override scoring and rules; Override tests.
P4  Pinnacle GameDefinition, scoring, rules, rollers; Pinnacle tests.
P5  Match flow, Loaders and human player, violation framework, skills/solo modes.
P6  three.js renderer, cameras, quality presets, 2D view, input wiring.
P7  React UI: ZDrive branding (wordmark, tagline, titles, meta tags, favicon, footer), /override and
    /pinnacle routes, game switcher, Play/Configure/Records, builder with preview, presets, settings,
    HUD, results.
P8  Bots, replays (export as zdrive-<game>-<mode>-<date>.json), records.
P9  Lazy-loading; README titled "ZDrive" (what it is, controls, builder guide, rules summary, Vercel:
    import repo, preset Vite, output dist/, unofficial disclaimer); final `npm test` and `npm run build`.

DONE WHEN: all tests pass, `npm run build` succeeds, the ZDrive name appears everywhere listed under
NAME AND BRANDING, and README is complete. Record every remaining EST value in PROGRESS.md.
