import type { GameId, RobotSpec } from '../shared/types';

/** Builder presets. Specs are plain data; ids are stable so saved robots can reference them. */

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

export function makeSpec(game: GameId, id: string, name: string, o: Partial2<RobotSpec> = {}): RobotSpec {
  const base: RobotSpec = {
    v: 1,
    id,
    name,
    game,
    chassis: { length: 16, width: 17, height: 14 },
    drive: {
      type: 'tank',
      wheelsPerSide: 2,
      wheelDia: 4,
      omni: [true, true, true, true],
      cartridge: 200,
      ratio: 1,
      motorsPerSide: [11, 11],
      strafeMotors: [],
    },
    intake: { type: 'none', mount: 'front', upright: true, lying: false, motors: [] },
    lift: { type: 'arm', maxHeight: 14, motors: [11] },
    effector: { type: 'claw', wrist: false, actuation: 'motor', motors: [5.5] },
    tool: { type: 'none', motors: [] },
    pneumatics: { tanks: 0, cylinders: 0 },
  };
  return {
    ...base,
    ...o,
    chassis: { ...base.chassis, ...o.chassis },
    drive: { ...base.drive, ...o.drive },
    intake: { ...base.intake, ...o.intake },
    lift: { ...base.lift, ...o.lift },
    effector: { ...base.effector, ...o.effector },
    tool: { ...base.tool, ...o.tool },
    pneumatics: { ...base.pneumatics, ...o.pneumatics },
  } as RobotSpec;
}

const SIX_WHEEL = { wheelsPerSide: 3 as const, wheelDia: 3.25 as const, omni: [true, false, true, true], cartridge: 600 as const, ratio: 0.75 };

export function presetsFor(game: GameId): RobotSpec[] {
  const p = (id: string, name: string, o: Partial2<RobotSpec>): RobotSpec => makeSpec(game, `preset:${id}`, name, o);
  const list: RobotSpec[] = [
    p('clawbot', 'Starter clawbot', {}),
    p('dr4b', 'DR4B dual-grip stacker', {
      chassis: { length: 17, width: 16, height: 15 },
      drive: { ...SIX_WHEEL, ratio: 0.6 },
      lift: { type: 'dr4b', maxHeight: 16, motors: [11, 11] },
      effector: { type: 'dual', wrist: false, actuation: 'pneumatic', motors: [] },
      tool: { type: 'wedge', motors: [] },
      pneumatics: { tanks: 1, cylinders: 2 },
    }),
    p('chainbar', 'Chain-bar with wrist flipper', {
      chassis: { length: 15, width: 16, height: 16 },
      drive: SIX_WHEEL,
      lift: { type: 'chainbar', maxHeight: 18, motors: [11, 11] },
      effector: { type: 'claw', wrist: true, actuation: 'motor', motors: [5.5] },
    }),
    p('conveyor', 'Conveyor intake feeding a claw', {
      chassis: { length: 17, width: 15, height: 15 },
      drive: SIX_WHEEL,
      intake: { type: 'conveyor', mount: 'front', upright: true, lying: true, motors: [11] },
      lift: { type: 'fourbar', maxHeight: 14, motors: [11] },
      effector: { type: 'claw', wrist: false, actuation: 'pneumatic', motors: [] },
      pneumatics: { tanks: 1, cylinders: 1 },
    }),
    p('xdrive', 'Fast X-drive (toggles / defense)', {
      chassis: { length: 15, width: 15, height: 12 },
      drive: { type: 'xdrive', wheelsPerSide: 2, wheelDia: 3.25, omni: [true, true], cartridge: 600, ratio: 0.75, motorsPerSide: [11, 11], strafeMotors: [] },
      intake: { type: 'flex', mount: 'front', upright: true, lying: false, motors: [5.5] },
      lift: { type: 'none', maxHeight: 0, motors: [] },
      effector: { type: 'claw', wrist: false, actuation: 'pneumatic', motors: [] },
      tool: { type: 'flipper', motors: [] },
      pneumatics: { tanks: 2, cylinders: 2 },
    }),
  ];
  if (game === 'pinnacle')
    list.push(
      p('stack', 'Pinnacle stack carrier', {
        chassis: { length: 17, width: 17, height: 16 },
        drive: { ...SIX_WHEEL, motorsPerSide: [11, 11, 11] },
        lift: { type: 'dr4b', maxHeight: 22, motors: [11, 11] },
        effector: { type: 'stack', wrist: true, actuation: 'motor', motors: [5.5] },
        tool: { type: 'spinner', motors: [5.5] },
      }),
    );
  return list;
}

export const defaultSpec = (game: GameId): RobotSpec => presetsFor(game)[0];
