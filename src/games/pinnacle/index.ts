import type { GameDefinition, ModeDef } from '../../engine/types';
import { presetsFor } from '../presets';
import { FIELD, GOALS, STARTS, layout } from './field';
import { PINNACLE_RULES } from './rules';
import { pinnacleAuton, scorePinnacle } from './scoring';

const supply = {
  red: { pins: { RY: 10, BY: 2, YY: 7 }, cups: 20 },
  blue: { pins: { BY: 10, RY: 2, YY: 7 }, cups: 20 },
};
const SOLO_TIMING = { autonSec: 0, pauseSec: 0, driverSec: 60, endgameSec: 30 };

const MODES: ModeDef[] = [
  {
    id: 'alliance',
    label: 'Alliance Match',
    blurb: '2 v 2 teams: 15 s Autonomous then Driver Control, 2:00 total. Park on a Loader at the end.',
    timing: { autonSec: 15, pauseSec: 0, driverSec: 105, endgameSec: 30 },
    robots: { red: 2, blue: 2 },
    starts: STARTS,
    layout: layout(),
    preload: { red: 'RY', blue: 'BY' },
    supply,
    loaderAccess: { red: ['red'], blue: ['blue'] },
    loadPhases: ['auton', 'driver'],
    solo: false,
  },
  {
    id: 'solo',
    label: 'Solo Driving',
    blurb: '60 s solo. Load from both driver boxes; roller colors decide which yellow halfpins count.',
    timing: SOLO_TIMING,
    robots: { red: 1, blue: 0 },
    starts: STARTS,
    layout: layout(),
    preload: { red: 'RY' },
    supply,
    loaderAccess: { red: ['red', 'blue'], blue: [] },
    loadPhases: ['driver'],
    solo: true,
  },
  {
    id: 'solocode',
    label: 'Solo Coding',
    blurb: '60 s with no controller. Timer and field only for now: the robot runs your routine (coming later).',
    timing: { autonSec: 60, pauseSec: 0, driverSec: 0, endgameSec: 0 },
    robots: { red: 1, blue: 0 },
    starts: STARTS,
    layout: layout(),
    preload: { red: 'RY' },
    supply,
    loaderAccess: { red: ['red', 'blue'], blue: [] },
    loadPhases: ['auton'],
    solo: true,
  },
  {
    id: 'free',
    label: 'Free Drive',
    blurb: 'No timer. Reset the field, spawn pieces and practice anything.',
    timing: { autonSec: 0, pauseSec: 0, driverSec: 0, endgameSec: 0, untimed: true },
    robots: { red: 1, blue: 0 },
    starts: STARTS,
    layout: layout(),
    preload: { red: 'RY' },
    supply,
    loaderAccess: { red: ['red', 'blue'], blue: ['blue'] },
    loadPhases: ['free'],
    solo: true,
  },
];

export const PINNACLE: GameDefinition = {
  id: 'pinnacle',
  name: 'Pinnacle',
  field: FIELD,
  modes: MODES,
  possession: { pins: 1, cups: 1, stacks: 1, ruleId: '3.3.2' },
  builder: {
    startMax: 18,
    footprintMax: 24,
    heightMax: null,
    totalWatts: 99,
    driveWatts: null,
    noPto: false,
    pneumaticPsi: 100,
    maxTanks: null,
    allowStackGripper: true,
  },
  holdingCount: 4,
  escalation: true,
  loaderCapacity: 1,
  loadDelaySec: 1, // EST
  scoring: scorePinnacle,
  autonResult: pinnacleAuton,
  rules: PINNACLE_RULES,
  bots: {
    targetGoals: (a) => [...GOALS.filter((g) => g.owner === a).map((g) => g.id), 'C', 'N1', 'N2'],
    wantDetents: (a) => FIELD.detents.map((d) => ({ id: d.id, color: a })),
    forbiddenGoals: (a) => GOALS.filter((g) => g.kind === 'alliance' && g.owner !== a).map((g) => g.id),
  },
  presets: () => presetsFor('pinnacle'),
};

/** Hook for RECF Inspire (college): two robots per team. Not implemented yet. */
export const INSPIRE_ROBOTS_PER_TEAM = 2;

export default PINNACLE;
