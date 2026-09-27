# Pinnacle (RECF Achieve 2026-27) — field layout data

> ZDrive note: this file uses +x toward the blue station. `src/games/*` rotate into the spec frame with (x, y) → (y, −x), so +y points toward the red station.

Source: RECF Achieve *Pinnacle* manual v1.2 (games.recf.org/achieve/1.2), text via web summary, plus figures
1.5.1 (objects), 1.5.2 (zones), 3.0.1 / 3.0.2 (solo setup + field setting guide), 5.2.2 (alliance start),
7.3.2 (field photo). No dimensioned drawings are published; all positions are scaled off figures and snapped
to the tile grid, so **every coordinate is EST** unless noted. Game objects/goals appear identical to V5RC
Override (same counts 56 cups / 63 pins); Override dims used where Pinnacle gives none (marked EST).

## Conventions
- Units inches. Origin = field center, tile surface; z up. Field 12'x12'; interior assumed **140.4"** (EST, VEX perimeter).
  Tiles 6x6, 23.4 each; tile seams at x,y = 0, ±23.4, ±46.8, ±70.2.
- **+x = toward the BLUE driver box** (right side of figs 1.5.x / 3.0.x / 5.2.2). **+y = toward Neutral Zone #1**
  (top of those figures). Red driver box is on the -x wall. Audience side not stated (EST: -y).
- "clear-up"/"opaque-up" = which cup half is on top. Placement tolerance ±1".

## Dimensions
| Item | Value | Source |
|---|---|---|
| Field | 12'x12', ~140.4 interior (EST) | 1.2 text |
| Goals | octagonal, Override sizes: alliance 3.25 tall, neutral 5.77, center 8.77; 5.61 AF footprint, opening Ø2.37 | EST (photo 7.3.2 matches Override goals) |
| Pin | 6.50 tall, two halves; collar 3.02 AF | EST (= Override) |
| Cup | 6.48 tall, Ø3.16 rims, Ø2.32 waist; one clear half, one opaque half | EST (= Override) |
| Roller | triangular bar on wall top, ~25.6 long (scaled), faces red / yellow / blue | fig 1.5.2 scale, photo 7.3.2; EST |
| Loader | Override loader (4.02 wide, projects ~3.74) | EST (photo matches) |
| Robot | start 18x18x18; max 24x24 footprint in match; height unlimited | text |
| Pneumatics | max 100 psi; no onboard compressor | text |
| Solo match | 60 s, driver only, no autonomous | text |
| Alliance match | 120 s total, first 15 s autonomous; no pause between periods stated | text 5.3.1 |

## Field elements
| id | type | x | y | z / height | orientation | Source |
|---|---|---|---|---|---|---|
| G_R+ | red goal, Red Zone | -46.8 | +23.4 | 3.25 EST | upright | 1.5.1/1.5.2 |
| G_R- | red goal, Red Zone | -46.8 | -23.4 | 3.25 EST | upright | same |
| G_B+ | blue goal, Blue Zone | +46.8 | +23.4 | 3.25 EST | upright | same |
| G_B- | blue goal, Blue Zone | +46.8 | -23.4 | 3.25 EST | upright | same |
| G_N1 | neutral goal (black), Neutral Zone #1 | 0 | +46.8 | 5.77 EST | upright | same |
| G_N2 | neutral goal (black), Neutral Zone #2 | 0 | -46.8 | 5.77 EST | upright | same |
| G_C | center goal (tall black), Center Zone | 0 | 0 | 8.77 EST | upright | same |
| RO_R | roller, red wall, Red Zone | -70.2 (wall) | 0 | on wall top | axis along y, length ~25.6 | 1.5.2 |
| RO_B | roller, blue wall, Blue Zone | +70.2 (wall) | 0 | on wall top | axis along y | 1.5.2 |
| RO_N1 | roller, top wall, Neutral Zone #1 | 0 | +70.2 (wall) | on wall top | axis along x | 1.5.2 |
| RO_N2 | roller, bottom wall, Neutral Zone #2 | 0 | -70.2 (wall) | on wall top | axis along x | 1.5.2 |
| LD_R+ / LD_R- | red loaders on red wall | -68.3 | +58.8 / -58.8 | - | - | 1.5.1 |
| LD_B+ / LD_B- | blue loaders on blue wall | +68.3 | +58.8 / -58.8 | - | - | 1.5.1 |
| DB_R / DB_B | driver boxes outside red wall / blue wall, full wall length | <-70.2 / >+70.2 | 0 | - | - | 1.5.1 |
| Z_RED | Red Zone: x -70.2..-23.4, all y | | | | | 1.5.2 |
| Z_BLUE | Blue Zone: x +23.4..+70.2, all y | | | | | 1.5.2 |
| Z_N1 | Neutral Zone #1: |x|<=23.4, y +23.4..+70.2 | | | | | 1.5.2 |
| Z_N2 | Neutral Zone #2: |x|<=23.4, y -70.2..-23.4 | | | | | 1.5.2 |
| Z_C | Center Zone: |x|<=23.4, |y|<=23.4 | | | | | 1.5.2 |
| TAPE | white tape: full-length lines x=±23.4; short lines y=±23.4 for |x|<=23.4 (width ~1, edge rule unknown) | | | | | 1.5.2 |

Rollers: robot turns (rotates) the bar about its long axis; discrete states = red / yellow / blue face showing
("set to" a color). Figures draw all four rollers yellow at start -> **start yellow** (EST). No roller for the center goal.
Effects: solo — yellow halfpin on a red or neutral goal scores only if that zone's roller is red; on a blue goal only if blue.
Alliance — neutral-goal cups (1) and yellow halfpins (5) score for the alliance whose color that zone's roller shows;
yellow halfpins on an alliance goal score if its zone roller matches. AWP-type task: alliance-zone roller showing own color;
also "at least one roller showing alliance color".

## Starting objects — Alliance / Solo field (identical layout in 1.5.1, 3.0.1, 3.0.2, 5.2.2)
Totals on field: 16 cups (8 opaque-up, 8 clear-up EST), pins 4 R/B, 6 R/Y, 6 B/Y, 5 Y/Y.
| id | type | x | y | orientation | up half | Source |
|---|---|---|---|---|---|---|
| WC_L+ | 3 cups along red wall at y 38.2 / 35.1 / 32.0 | -68.6 | +35.1 | upright | outer 2 opaque; middle clear | 3.0.2 guide |
| WC_L+ pin | R/B pin nested in middle cup | -68.6 | +35.1 | upright | BLUE | 3.0.2, 7.3.2 |
| WC_L- | 3 cups at y -32.0 / -35.1 / -38.2 | -68.6 | -35.1 | upright | outer opaque; middle clear | 3.0.2 |
| WC_L- pin | R/B pin in middle cup | -68.6 | -35.1 | upright | BLUE | 3.0.2 |
| WC_R+ | 3 cups on blue wall | +68.6 | +35.1 | upright | outer opaque; middle clear | 3.0.2 |
| WC_R+ pin | R/B pin in middle cup | +68.6 | +35.1 | upright | RED | 3.0.2, 7.3.2 |
| WC_R- | 3 cups on blue wall | +68.6 | -35.1 | upright | outer opaque; middle clear | 3.0.2 |
| WC_R- pin | R/B pin in middle cup | +68.6 | -35.1 | upright | RED | 3.0.2 |
| C1..C4 | single empty cups (green in guide) | (0,+23.4) (0,-23.4) (-46.8,0) (+46.8,0) | | upright | clear | 3.0.2 |
| GC_pin | Y/Y pin nested in center goal | 0 | 0 | upright | yellow | 3.0.2 guide, 7.3.2 |
| P1 | R/Y pin | -46.8 | +50.05 | lying, axis y; red end +y | - | 1.5.1 |
| P2 | B/Y pin | -46.8 | +43.55 | lying, axis y; blue end -y (yellow ends meet at y=+46.8) | - | 1.5.1 |
| P3 | B/Y pin | -46.8 | -43.55 | lying, axis y; blue end +y | - | 1.5.1 |
| P4 | R/Y pin | -46.8 | -50.05 | lying, axis y; red end -y | - | 1.5.1 |
| P5 | B/Y pin | +46.8 | +50.05 | lying, axis y; blue end +y | - | 1.5.1 |
| P6 | R/Y pin | +46.8 | +43.55 | lying, axis y; red end -y | - | 1.5.1 |
| P7 | R/Y pin | +46.8 | -43.55 | lying, axis y; red end +y | - | 1.5.1 |
| P8 | B/Y pin | +46.8 | -50.05 | lying, axis y; blue end -y | - | 1.5.1 |
| P9 | B/Y pin at Center Zone corner, outside | -25.7 | +25.7 | lying, axis diag (-1,+1); blue end outward | - | 1.5.1 |
| P10 | Y/Y pin, inside Center Zone | -21.1 | +21.1 | lying, axis diag (+1,-1) | - | 1.5.1 |
| P11 | B/Y pin | +25.7 | +25.7 | lying, diag (+1,+1); blue end outward | - | 1.5.1 |
| P12 | Y/Y pin | +21.1 | +21.1 | lying, diag | - | 1.5.1 |
| P13 | R/Y pin | -25.7 | -25.7 | lying, diag (-1,-1); red end outward | - | 1.5.1 |
| P14 | Y/Y pin | -21.1 | -21.1 | lying, diag | - | 1.5.1 |
| P15 | R/Y pin | +25.7 | -25.7 | lying, diag (+1,-1); red end outward | - | 1.5.1 |
| P16 | Y/Y pin | +21.1 | -21.1 | lying, diag | - | 1.5.1 |
Corner pairs P9-P16: yellow ends touch at the tape corner (±23.4, ±23.4); centers = corner ± 2.3 per axis (3.25 along diagonal).
Goals other than center start empty.

Off-field supply per driver box (both setups): 20 cups, 10 own-color/Y pins, 2 opposite-color/Y pins, 7 Y/Y pins;
plus 2 own-color/Y pins drawn at the box ends = preloads (1 per robot). Counts reconcile to 56 cups / 4-20-20-19 pins.

## Solo setup (3.0.1 / 3.0.2)
| Item | Value | Source |
|---|---|---|
| Objects | same as table above | 3.0.1/3.0.2 |
| Robot start | shaded "Robot Starting Area" top-left: x -70.2..-49.9, y +41.1..+70.2 (EST); text: robot touching one of the two red loaders | 3.0.1, text |
| Preload | 1 R/Y pin | text |
| Loaders used | red loaders only | text |
| Scoring | cup 1; alliance-color halfpin on matching or neutral goal 5; yellow halfpin 5 if zone roller matches; any halfpin on center goal 10 | text |

## Alliance setup (5.2.2)
| Item | Value | Source |
|---|---|---|
| Objects | same as table above | 5.2.2 |
| Red start areas | 2 corners: x -70.2..-49.4, y +41.6..+70.2 and y -70.2..-41.6 (EST), each containing a red loader | 5.2.2 |
| Blue start areas | mirrored at x +49.4..+70.2 | 5.2.2 |
| Preloads | red robots R/Y, blue robots B/Y (1 each) | text |
| Match loads | drive team feeds own-color loaders from supply in both periods | text |
| Scoring | cup 1 (neutral-goal cups only with matching roller); own-color halfpin 5; yellow halfpin 5 (roller match); center-goal halfpin 10; center yellow halfpins 10 to alliance with more colored halfpins there; parked 21 | text |
| Timing | 120 s: 0-15 s autonomous, 15-120 s driver; no pause stated | text 5.3.1 |

## Definitions (paraphrased)
- Halfpin: one colored half of a pin.
- Visible: halfpin color can be seen in the stack (counts only if visible; Override rule: not inside opaque cup half — EST carry-over).
- Nested: pin into a goal or a scored cup; cup onto a scored pin.
- Stack: nested objects; a robot may carry one stack of any height.
- Pinnacle: game name; "pinnacle" also appears as a loader-capacity item (loader holds one cup, one pin, or one pinnacle) — undefined in text; assume a pin+cup stack (EST).
- Roller: wall-mounted bar turned by robots to show red / yellow / blue; controls yellow-halfpin (and neutral cup) scoring in its zone.
- Loader: 4 total, two per alliance beside driver boxes; holds 1 object at a time; team member must release before robot touches.
- Zones: Red, Blue, Neutral #1, Neutral #2, Center (boundaries above).
- Supply: objects in driver boxes loaded into loaders during the match.
- Parked: robot touching one of its alliance loaders at end, max one robot per loader (21).

## Open questions / EST
- All coordinates scaled from undimensioned figures (grid-snapped); ±1" at best.
- Field interior 140.4 assumed; audience side not stated.
- Roller length (~25.6), mount height, face order, and starting color (yellow) inferred from figures/photo; summary text
  once said "two colors" but scoring cites red/yellow/blue settings — treat as 3-face (EST).
- Goal/pin/cup/loader dims taken from Override — EST.
- Cup up-sides (wall-cluster outer cups opaque-up, middle and singles clear-up) read from 3.0.2 icons — EST.
- "Pinnacle" object definition not found; second R/Y at red box ends in solo unexplained (spare/unused preload?).
- Start-area bounds (≈20.8 x 28.6) scaled — EST.
