# Override (VEX V5RC 2026-27) — field layout data

> ZDrive note: this file uses +x toward the blue station. `src/games/*` rotate into the spec frame with (x, y) → (y, −x), so +y points toward the red station.

Source: VEX V5RC *Override* Game Manual v2.0 (override-2.0.pdf). Figures used: FO-2 (start config),
RSC4-1 (skills), Appendix A drawings "Pin/Cup/Goal/Toggle/Loader Specifications", "Field Element
Locations", "Tape Line Specifications", "Scoring Object Locations", "Portable/Metal Field Perimeter",
"Toggle Assembly - Starting Orientation", "AprilTag Numbering/Locations" (manual pp. A5-A16).
Values are extracted numbers; wording is ours.

## Conventions
- Units inches. Origin = field center, on the tile surface. z up.
- Interior (wall-to-wall) = **140.41"** (portable perimeter; metal perimeter 140.50). Half-width H = 70.20.
- **+x = toward the BLUE Alliance Station** (right side of the Appendix A "Audience View" drawings).
  **+y = away from the audience** (toward the wall marked "0°" in Appendix A). Red station is the -x wall,
  audience is the -y wall.
- Conversion from Appendix A drawing coords (origin at bottom-left inside corner): x = Xd - 70.20, y = Yd - 70.20.
- Grid spacing of goals/objects is 23.55 (Xd 23.11/46.66/70.20/93.75/117.30); tiles 6x6, ~23.40 each.
  +/-0.01 asymmetries from the drawing are rounded to symmetric values.
- Quadrants (triangles): L = x < -|y| (red), A = y < -|x| (red, audience wall), F = y > |x| (blue, far wall),
  R = x > |y| (blue). Red side of Autonomous Line = y < -x.
- "gray-up" = opaque half of cup on top; "clear-up" = transparent half on top.
- Tolerance: field elements +/-1.0"; object start placement +/-1"; object rotation about z unspecified.

## Dimensions
| Item | Value | Source |
|---|---|---|
| Perimeter (portable) | 140.40-140.41 interior, wall 11.54 tall, 2.00 thick | Portable Perimeter dwg |
| Perimeter (metal) | 140.50 interior, wall 11.50 tall, 1.27 thick | Metal Perimeter dwg |
| Goal footprint (alliance) | octagon 5.61 across flats (2.81 center-to-flat), R3.22 center-to-corner; base flange 0.39 thick | Goal Spec |
| Goal top / opening | top 3.49 across; opening Ø2.37 | Goal Spec |
| Goal heights | alliance 3.25; short neutral 5.77 (lower block 2.52); tall center 8.77 (lower block 5.52) | Goal Spec |
| Neutral goal footprint | ~5.6 square-ish octagon | EST (scaled off Goal Spec) |
| Pin | height 6.50; each half 3.25 | Pin Spec |
| Pin collar (mid flange) | hex-like, 3.02 across flats, Ø3.16 across corners; collar ~0.64 thick (6.50-2x2.93) | Pin Spec (thickness EST) |
| Pin cone | Ø2.35 at collar, tapering to Ø1.40 flat end; straight end section 0.64 long | Pin Spec |
| Pin "diameter" | glossary says ~1.6" (40 mm); no drawn dim = 1.6 -> nominal only. Use tip Ø1.40 / cone Ø2.35 / collar 3.02 AF | Glossary vs Pin Spec |
| Cup | height 6.48 (glossary 6.5); rim Ø3.16 at both ends; waist Ø2.32 at mid-height | Cup Spec |
| Cup halves | one opaque (dark gray), one transparent; inner diameters & mass not given | Cup Spec / glossary |
| Toggle | triangular prism; 25.99 between mounts (glossary 25.8 long); apex-to-base 2.03; faces ~2.05 wide | Toggle Spec / glossary |
| Toggle pivot | axis 1.19 below apex (0.84 above base face); axis 13.20 above tiles (wall top 11.54) | Toggle Spec |
| Toggle faces | red, blue, yellow; 3 "set" states (a face flat on mounts), 120 deg apart; free rotation otherwise | Toggle Spec, SC4 |
| Loader | 4.02 wide; tube Ø3.39; projects 3.74 from wall face into field | Loader Spec |
| Loader heights | top 14.37 (lowered) / 22.97 (raised, loadable from back); bottom exit opening 3.25 tall; lower shield 11.85 | Loader Spec (lowered/raised reading EST) |
| Autonomous Line | pair of tapes, 2.50 overall width | Tape Line Spec (interpretation EST) |
| Midfield tape | tape centerline vertices on tile corners (+/-23.40 on axes); outer-edge side 34.05 | Tape Line Spec |
| Midfield inner edge | square rotated 45 deg, |x|+|y| <= 22.72 (inner side ~32.1); tape ~0.96 wide | EST (derived) |
| Robot | start 18x18x18; max 24x24 footprint during match; 50 tall max | SG1-SG3 |
| R25 pneumatics | max 2 VEX Air Tanks (276-8749); max 100 psi; air only to actuate legal pneumatic devices; no cylinder-count limit stated | R25 |
| Match timing | 15 s autonomous + 1:45 driver (VEX U: 30 s auton); Skills 60 s | Primer, glossary |

## Field elements
| id | type | x | y | z / height | orientation | Source |
|---|---|---|---|---|---|---|
| G0 | tall neutral goal (black), quadrant: Midfield | 0 | 0 | 8.77 | upright | Field Element Locations |
| G_L1 | alliance goal RED, quad L | -47.10 | -23.55 | 3.25 | upright | same |
| G_L2 | short neutral (black), quad L | -47.10 | +23.55 | 5.77 | upright | same |
| G_A1 | alliance goal RED, quad A | -23.55 | -47.10 | 3.25 | upright | same |
| G_A2 | short neutral, quad A | +23.55 | -47.10 | 5.77 | upright | same |
| G_F1 | short neutral, quad F | -23.55 | +47.10 | 5.77 | upright | same |
| G_F2 | alliance goal BLUE, quad F | +23.55 | +47.10 | 3.25 | upright | same |
| G_R1 | alliance goal BLUE, quad R | +47.10 | +23.55 | 3.25 | upright | same |
| G_R2 | short neutral, quad R | +47.10 | -23.55 | 5.77 | upright | same |
| T_L | Toggle, red quad L, on red-station wall | -70.2 (wall) | 0 | axis 13.20 | axis along y | Field Element Locations |
| T_A | Toggle, red quad A, audience wall | 0 | -70.2 (wall) | axis 13.20 | axis along x | same |
| T_F | Toggle, blue quad F, far wall | 0 | +70.2 (wall) | axis 13.20 | axis along x | same |
| T_R | Toggle, blue quad R, blue-station wall | +70.2 (wall) | 0 | axis 13.20 | axis along y | same |
| LD_R1 | Loader RED | -68.3 EST (front face -66.46) | +58.77 | top 14.37 | on red wall | Field Element Locations |
| LD_R2 | Loader RED | -68.3 EST (front -66.46) | -58.77 | top 14.37 | on red wall | same |
| LD_B1 | Loader BLUE | +68.3 EST (front +66.46) | +58.77 | top 14.37 | on blue wall | same |
| LD_B2 | Loader BLUE | +68.3 EST (front +66.46) | -58.77 | top 14.37 | on blue wall | same |
| LZ (x4) | Load Zone tape L around each loader: red at x<-58.5, |y|>46.6; blue mirrored at x>+58.5 | ±(58.5..70.2) | ±(46.6..70.2) | - | tape: long leg along wall-normal line at x=±58.5 (outer edge at tile center), short leg at |y|~46.6-47.1 | Tape Line Spec, EST |
| AL | Autonomous Line: double tape centered on y = -x, from red LZ corner (-58.5,+58.5 EST) to Midfield, and Midfield to blue LZ corner (+58.5,-58.5 EST); includes Midfield ring | - | - | - | 2.50 wide | Tape Line Spec |
| QL | Quadrant divider: single tape on y = +x, LZ corner to Midfield (both ends) | - | - | - | - | Tape Line Spec |
| MF | Midfield: diamond, tape centerline vertices (0,±23.40),(±23.40,0); inner edge |x|+|y|<=22.72 EST | 0 | 0 | infinite height | - | Tape Line Spec |
| AS_R / AS_B | Alliance Stations outside red wall (x<-70.2) / blue wall (x>+70.2) | ∓71+ | 0 | - | - | FO-1, FO-2 |

Toggle start (Appendix "Toggle Assembly - Starting Orientation"): all four start with **yellow face up/into the
field** (neutral). Red-quadrant toggles (T_L, T_A): red face outward (away from field). Blue-quadrant toggles
(T_R, T_F): blue face outward. Third face (opposite alliance color) therefore rests on the mounts (EST).
A toggle counts as set only when a face is flat on its mounts and no robot touches it; else yellow.

AprilTags (one per goal, on a goal face; alliance-goal tag center 1.49 above tiles; facing direction and neutral-goal tag
height not given): ID0 = G0; ID1 = G_L2, G_R2; ID2 = G_L1, G_R1; ID3 = G_A1, G_F2; ID4 = G_A2, G_F1
(IDs repeat under 180-deg rotation). Source: AprilTag Numbering/Locations dwg.

## Starting objects — Head-to-Head (FO-2 + "Scoring Object Locations")
Totals on field: 36 cups (24 gray-up, 12 clear-up); pins 4 R/B, 8 R/Y, 8 B/Y, 17 Y/Y. 28 objects on AL = 4 crosses x5 + 4 Midfield vertices x2.
| id | type | x | y | orientation | up half | Source |
|---|---|---|---|---|---|---|
| WC_F- / WC_F+ | far wall clusters | -23.55 / +23.55 | +68.62 | - | - | same |
| WC_A- / WC_A+ | audience wall clusters | -23.55 / +23.55 | -68.62 | - | - | same |
| WC_L- / WC_L+ | red wall clusters | -68.62 | -23.55 / +23.55 | - | - | same |
| WC_R- / WC_R+ | blue wall clusters | +68.62 | -23.55 / +23.55 | - | - | same |
| per cluster | 2 cups at center ±3.16 along wall (i.e. 20.38 / 26.70) | | | upright | gray | FO-2 |
| per cluster | 1 cup at center + Y/Y pin nested in it | | | upright | cup gray; pin yellow | FO-2 |
| X1..X4 (cross centers) | cup, on AL | (-47.10,+47.10) (-23.55,+23.55) (+23.55,-23.55) (+47.10,-47.10) | | upright | clear | FO-2 |
| per cross -x arm | R/Y pin, center (cx-4.75, cy) EST | | | lying, axis x; red end toward -x | - | FO-2 |
| per cross -y arm | R/Y pin, center (cx, cy-4.75) EST | | | lying, axis y; red end toward -y | - | FO-2 |
| per cross +x arm | B/Y pin, center (cx+4.75, cy) EST | | | lying, axis x; blue end toward +x | - | FO-2 |
| per cross +y arm | B/Y pin, center (cx, cy+4.75) EST | | | lying, axis y; blue end toward +y | - | FO-2 |
| D1..D4 | cup + Y/Y pin nested, on QL diagonal | (-47.10,-47.10) (-23.55,-23.55) (+23.55,+23.55) (+47.10,+47.10) | | upright | cup clear; pin yellow | FO-2 |
| M_F | cup + R/B pin (Midfield vertex, on AL) | 0 | +23.55 | upright | cup clear; pin BLUE up | FO-2 |
| M_R | cup + R/B pin | +23.55 | 0 | upright | clear; BLUE up | FO-2 |
| M_L | cup + R/B pin | -23.55 | 0 | upright | clear; RED up | FO-2 |
| M_A | cup + R/B pin | 0 | -23.55 | upright | clear; RED up | FO-2 |
| GP (x5) | Y/Y pin nested in each neutral goal (G0, G_L2, G_A2, G_F1, G_R2) | goal xy | | upright | yellow | FO-2 |
Cross arms: yellow (inner) ends point at the cross cup; 4.75 = 1.58 cup radius + 3.25 half pin (EST, figure ~4.5).
Off-field per alliance: Match Loads 10 cups + 10 own-color/Y pins + 1 Y/Y; Preloads 2 own-color/Y (1 per robot, touching it).
Robot start (SG1): <=18" cube, own side of AL, touching tiles + perimeter, one robot per quadrant, not touching goals/loaders/LZ/toggles.

## Skills setup (RSC4-1, RSC2/RSC4)
| Item | Value | Source |
|---|---|---|
| Field objects | same as H2H except the 5 goal Y/Y pins are absent (all goals empty) -> on field 36 cups, 4 R/B, 8 R/Y, 8 B/Y, 12 Y/Y | RSC4-1, RSC4c |
| Match loads | 3 R/Y, 4 B/Y, 7 cups; only via red loaders, any time | RSC4b, RSC2d |
| Preload | 1 R/Y | RSC2c |
| Robot start | quadrant L (adjacent to red station), legal start per SG1 | RSC2a |
| Scoring | red/blue pin 5, yellow pin 10 (toggle must match quadrant color), robot in Midfield 8 | RSC3 |
| GPS strip | installed for Autonomous Coding Skills | RSC4a |

## Definitions (paraphrased)
- Pin: 2 halves, each red/blue/yellow; ~6.5 tall. Cup: 2 halves, one transparent, one opaque.
- Nested: a pin half breaks the plane of a cup/goal opening (any amount).
- Placed pin: nested with a goal or with a cup nested on another placed pin; each goal / cup half holds at most one pin half.
- Placed cup: nested with a placed pin.
- Scored: each visible half of a placed pin (red->red, blue->blue, yellow->owner). Visible = not inside the opaque half of a cup.
- Owned (yellow): quadrant toggle set to that alliance color; Midfield yellow -> alliance with more robots in Midfield at end (tie = nobody).
- Toggle set: face flat on mounts at rest + no robot contact; else yellow.
- Loader: match loads enter top (or back when raised); removed only from bottom opening; own-color loaders only.
- Load Zone: infinite-height volume between perimeter and outer edges of colored tape around each loader.
- Midfield: infinite-height volume inside inner edges of white tape square; robot "in" if any part extends into it.
- Quadrant: triangle bounded by outer edges of white tape, perimeter, and LZ tape; color = its alliance goal.
- Autonomous Line: the double diagonal tape + space between + around the Midfield.

## Open questions / EST
- Loader center x (-68.3/+68.3) estimated from Ø3.39 tube within 3.74 projection; drawing dims only front face.
- Loader 14.37 vs 22.97 interpreted as lowered vs raised positions.
- Load Zone tape extents (x=±58.5 outer edge at tile center; |y|≈46.6-47.1) scaled/derived — EST.
- Midfield inner edge (22.72) and tape width (~0.96) derived from 34.05 outer side + tile-corner rule — EST.
- Autonomous Line 2.50: assumed outer-to-outer width of the tape pair — EST.
- Cross arm pin offset 4.75 — EST. Toggle outward axis offset from wall face not dimensioned (sits over wall top).
- Toggle rest face at start (opposite-alliance face down) inferred — EST. No mechanical detent described; "set" = face flat on mounts.
- Neutral/tall goal footprints (~5.6) and AprilTag facing directions not dimensioned.
- Cup inner diameters, pin/cup mass: not given. Which icon half = "up" read from FO-2 legend ("this side up" = icon top).
