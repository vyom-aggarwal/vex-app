import type { GameDefinition, ModeDef } from '../engine/types';
import { presetsFor } from '../games/presets';
import type { Alliance, BotStyle, RobotEntry, RobotSpec } from '../shared/types';
import type { Settings } from './settings';

/** Which preset a bot of each style drives when it doesn't copy the player's robot. */
function botSpec(game: GameDefinition, style: BotStyle): RobotSpec {
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

/** Build the robot lineup for a mode: the player is always robot 0. */
export function lineup(game: GameDefinition, mode: ModeDef, player: RobotSpec, s: Settings): RobotEntry[] {
  const mine: Alliance = mode.solo ? 'red' : s.alliance;
  const theirs: Alliance = mine === 'red' ? 'blue' : 'red';
  const out: RobotEntry[] = [{ spec: player, alliance: mine, driver: 'player', slot: 0 }];
  const bot = (alliance: Alliance, style: BotStyle, slot: number): RobotEntry => ({
    spec: s.botsUseMyRobot ? player : botSpec(game, style),
    alliance,
    driver: { style, level: s.botLevel },
    slot,
  });
  const nMine = mode.robots[mine];
  const nTheirs = mode.robots[theirs];
  for (let i = 1; i < nMine; i++) out.push(bot(mine, s.partnerStyle, i));
  const oppStyles: BotStyle[] = [s.opponentStyle, s.opponentStyle === 'scorer' ? 'controller' : 'scorer'];
  for (let i = 0; i < nTheirs; i++) out.push(bot(theirs, oppStyles[i % 2], i));
  return out;
}
