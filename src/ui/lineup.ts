import type { GameDefinition, ModeDef } from '../engine/types';
import { presetsFor } from '../games/presets';
import type { Alliance, BotStyle, RobotEntry, RobotSpec } from '../shared/types';
import type { BotSlot, Settings } from './settings';

/** Which preset a bot of each style drives when it doesn't copy the player's robot. */
export function botSpec(game: GameDefinition, style: BotStyle): RobotSpec {
  const p = presetsFor(game.id);
  const byId = (id: string) => p.find((x) => x.id === `preset:${id}`) ?? p[0];
  switch (style) {
    case 'scorer':
      return game.id === 'pinnacle' ? byId('stack') : byId('dr4b');
    case 'controller':
    case 'defender':
      return byId('xdrive');
    default:
      return byId('chainbar');
  }
}

/**
 * Build the robot lineup for a mode from the Match settings: the player is always robot 0, then the
 * partner, then opponents. "None" slots are left empty; "Dummy" robots never move.
 */
export function lineup(game: GameDefinition, mode: ModeDef, player: RobotSpec, s: Settings): RobotEntry[] {
  const mine: Alliance = mode.solo ? 'red' : s.alliance;
  const theirs: Alliance = mine === 'red' ? 'blue' : 'red';
  const mySlots = mode.starts.filter((x) => x.alliance === mine).length || 1;
  const playerSlot = mode.robots[mine] > 1 ? s.startSlot % mySlots : s.startSlot % mySlots;
  const out: RobotEntry[] = [{ spec: player, alliance: mine, driver: 'player', slot: playerSlot }];
  const add = (slot: BotSlot, alliance: Alliance, index: number) => {
    if (slot.kind === 'none') return;
    out.push({
      spec: slot.mirror ? player : botSpec(game, slot.style),
      alliance,
      driver: slot.kind === 'dummy' ? 'dummy' : { style: slot.style, level: slot.level },
      slot: index,
    });
  };
  if (mode.robots[mine] > 1) add(s.partner, mine, (playerSlot + 1) % mySlots);
  const opp = [s.opponent1, s.opponent2];
  for (let i = 0; i < mode.robots[theirs]; i++) add(opp[i] ?? s.opponent1, theirs, i);
  return out;
}

/** Human-readable lineup summary for the Play screen. */
export function describeSlot(slot: BotSlot): string {
  if (slot.kind === 'none') return 'Empty';
  if (slot.kind === 'dummy') return 'Dummy (stationary)';
  const style = { scorer: 'Scorer', controller: 'Toggle/Roller', defender: 'Defender', mixed: 'Mixed' }[slot.style];
  return `AI ${slot.level[0].toUpperCase() + slot.level.slice(1)} · ${style}`;
}
