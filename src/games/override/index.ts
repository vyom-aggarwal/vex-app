import type { GameDefinition, ModeDef } from '../../engine/types';
import { presetsFor } from '../presets';
import { FIELD, GOALS, QUAD_COLOR, STARTS, matchLayout } from './field';
import { OVERRIDE_RULES } from './rules';
import { overrideAuton, scoreOverride } from './scoring';

const MATCH_TIMING = { autonSec: 15, pauseSec: 0, driverSec: 105, endgameSec: 10 };
const matchSupply = {
  red: { pins: { RY: 10, YY: 1 }, cups: 10 },
  blue: { pins: { BY: 10, YY: 1 }, cups: 10 },
};

const MODES: ModeDef[] = [
  {
    id: 'match',
    label: 'Match 2v2',
    blurb: '15 s Autonomous + 1:45 Driver Control with a bot partner against two bot opponents.',
    timing: MATCH_TIMING,
    robots: { red: 2, blue: 2 },
    starts: STARTS,
    layout: matchLayout(true),
    preload: { red: 'RY', blue: 'BY' },
    supply: matchSupply,
    loaderAccess: { red: ['red'], blue: ['blue'] },
    loadPhases: ['driver'],
    solo: false,
  },
  {
    id: 'match1v1',
    label: 'Match 1v1',
    blurb: 'Full match timing, one robot per alliance.',
    timing: MATCH_TIMING,
    robots: { red: 1, blue: 1 },
    starts: STARTS,
    layout: matchLayout(true),
    preload: { red: 'RY', blue: 'BY' },
    supply: matchSupply,
    loaderAccess: { red: ['red'], blue: ['blue'] },
    loadPhases: ['driver'],
    solo: false,
  },
  {
    id: 'skills',
    label: 'Driver Skills',
    blurb: '60 s solo from the red station quadrant. Goals start empty; load through red Loaders any time.',
    timing: { autonSec: 0, pauseSec: 0, driverSec: 60, endgameSec: 0 },
    robots: { red: 1, blue: 0 },
    starts: STARTS,
    layout: matchLayout(false),
    preload: { red: 'RY' },
    supply: { red: { pins: { RY: 3, BY: 4 }, cups: 7 } },
    loaderAccess: { red: ['red'], blue: [] },
    loadPhases: ['driver'],
    solo: true,
  },
  {
    id: 'free',
    label: 'Free Drive',
    blurb: 'No timer. Reset the field, spawn pieces and practice anything.',
    timing: { autonSec: 0, pauseSec: 0, driverSec: 0, endgameSec: 0, untimed: true },
    robots: { red: 1, blue: 0 },
    starts: STARTS,
    layout: matchLayout(true),
    preload: { red: 'RY' },
    supply: matchSupply,
    loaderAccess: { red: ['red', 'blue'], blue: ['blue'] },
    loadPhases: ['free'],
    solo: true,
  },
];

export const OVERRIDE: GameDefinition = {
  id: 'override',
  name: 'Override',
  field: FIELD,
  modes: MODES,
  possession: { pins: 1, cups: 1, stacks: 0, ruleId: 'SG6' },
  builder: {
    startMax: 18,
    footprintMax: 24,
    heightMax: 50,
    totalWatts: 88,
    driveWatts: 55,
    noPto: true,
    pneumaticPsi: 100,
    maxTanks: 2,
    allowStackGripper: false,
  },
  holdingCount: 3,
  escalation: false,
  loaderCapacity: 6, // EST
  loadDelaySec: 1, // EST
  scoring: scoreOverride,
  autonResult: overrideAuton,
  rules: OVERRIDE_RULES,
  bots: {
    targetGoals: (a) => [
      ...GOALS.filter((g) => g.owner === a).map((g) => g.id),
      ...GOALS.filter((g) => g.kind === 'neutral' && QUAD_COLOR[g.region as keyof typeof QUAD_COLOR] === a).map((g) => g.id),
      'G0',
    ],
    wantDetents: (a) => FIELD.detents.map((d) => ({ id: d.id, color: a })),
    forbiddenGoals: (a) => GOALS.filter((g) => g.kind === 'alliance' && g.owner !== a).map((g) => g.id),
  },
  presets: () => presetsFor('override'),
};

export default OVERRIDE;
