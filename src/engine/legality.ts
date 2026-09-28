import type { MotorW, RobotSpec } from '../shared/types';
import { effectorSlots, footprintX, pneumaticBudget, robotHeight, storageCapacity } from './mechanism';
import type { BuilderRules, PossessionRule } from './types';

/** Builder legality: live power sums and size checks against a game's caps. Pure. */

export interface Legality {
  ok: boolean;
  errors: string[];
  warnings: string[];
  driveW: number;
  totalW: number;
  maxLength: number;
  maxWidth: number;
  maxHeight: number;
  capacity: string;
  airActuations: number;
}

const watts = (m: MotorW[]): number => m.reduce((a, w) => a + w, 0);

export function driveWatts(s: RobotSpec): number {
  return watts(s.drive.motorsPerSide) * 2 + (s.drive.type === 'hdrive' ? watts(s.drive.strafeMotors) : 0);
}

export function totalWatts(s: RobotSpec): number {
  return driveWatts(s) + watts(s.intake.motors) + watts(s.lift.motors) + watts(s.effector.motors) + watts(s.tool.motors);
}

export function checkLegality(s: RobotSpec, rules: BuilderRules, poss: PossessionRule): Legality {
  const errors: string[] = [];
  const warnings: string[] = [];
  const driveW = driveWatts(s);
  const totalW = totalWatts(s);
  const c = s.chassis;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  if (c.length > rules.startMax || c.width > rules.startMax || c.height > rules.startMax) {
    const over = (['length', 'width', 'height'] as const).filter((k) => c[k] > rules.startMax);
    errors.push(`Starting size is ${c.length} × ${c.width} × ${c.height} in; the limit is ${rules.startMax} in. Set the frame ${over.join(' and ')} to ${rules.startMax} in or less.`);
  }
  if (rules.driveWatts !== null && driveW > rules.driveWatts) {
    const excess = driveW - rules.driveWatts;
    const fix = excess <= 11 ? 'Switch one motor per side to 5.5 W, or remove one motor per side.' : `Remove ${Math.ceil(excess / 22)} motor${Math.ceil(excess / 22) > 1 ? 's' : ''} per side.`;
    errors.push(`Drivetrain is ${driveW} W; cap is ${rules.driveWatts} W. ${fix}`);
  }
  if (totalW > rules.totalWatts) {
    const excess = totalW - rules.totalWatts;
    errors.push(`Motors total ${totalW} W; cap is ${rules.totalWatts} W. Remove ${excess} W: drop ${excess <= 5.5 ? 'a 5.5 W motor or switch an 11 W motor to 5.5 W' : `${Math.ceil(excess / 11)} × 11 W of mechanism or drive motors`}.`);
  }
  if (s.effector.type === 'stack' && !rules.allowStackGripper) errors.push('The stack gripper is Pinnacle only. Choose Claw or Dual grip in End effector.');
  if ((s.drive.type === 'xdrive' || s.drive.type === 'mecanum') && s.drive.motorsPerSide.length !== 2)
    errors.push('X-drive and mecanum need one motor per wheel. Set Drivetrain motors to 2 per side.');
  if (s.drive.type === 'hdrive' && s.drive.strafeMotors.length === 0) errors.push('H-drive needs a center wheel motor. Add one in Drivetrain.');
  if (s.drive.motorsPerSide.length === 0) errors.push('The drivetrain has no motors. Add at least one per side.');
  let maxLength = 0;
  let maxHeight = 0;
  for (let i = 0; i <= 20; i++) {
    const f = footprintX(s, i / 20);
    maxLength = Math.max(maxLength, f.max - f.min);
    maxHeight = Math.max(maxHeight, robotHeight(s, i / 20));
  }
  const maxWidth = c.width;
  if (maxLength > rules.footprintMax || maxWidth > rules.footprintMax)
    errors.push(
      `Expanded footprint is ${r1(maxLength)} × ${r1(maxWidth)} in; the limit is ${rules.footprintMax} × ${rules.footprintMax} in. Shorten the frame by ${r1(Math.max(maxLength, maxWidth) - rules.footprintMax)} in, or pick a lift that reaches less far forward.`,
    );
  if (rules.heightMax !== null && maxHeight > rules.heightMax)
    errors.push(`Raised height is ${r1(maxHeight)} in; the limit is ${rules.heightMax} in. Lower the max grip height to ${Math.floor(s.lift.maxHeight - (maxHeight - rules.heightMax))} in.`);
  if (rules.maxTanks !== null && s.pneumatics.tanks > rules.maxTanks) errors.push(`${s.pneumatics.tanks} air tanks; at most ${rules.maxTanks} are allowed. Remove ${s.pneumatics.tanks - rules.maxTanks}.`);
  const needsAir = s.effector.actuation === 'pneumatic' || s.tool.type === 'flipper';
  if (needsAir && s.pneumatics.tanks === 0) errors.push('Pneumatic parts need air. Add an air tank in Pneumatics.');
  if (needsAir && s.pneumatics.cylinders === 0) errors.push('Pneumatic parts need a cylinder. Add one in Pneumatics.');
  if (s.lift.type !== 'none' && s.lift.motors.length === 0) warnings.push('The lift has no motors, so it cannot move. Add a lift motor.');
  if (s.intake.type !== 'none' && s.intake.motors.length === 0) warnings.push('The intake has no motors. Add one, or set Intake to None.');
  if (s.tool.type === 'spinner' && s.tool.motors.length === 0) warnings.push('The spinner wheel has no motor. Add one in Tools.');
  if (s.effector.wrist && s.effector.actuation === 'motor' && s.effector.motors.length === 0) warnings.push('A motor wrist needs an end effector motor. Add one, or switch to pneumatic.');
  const slots = effectorSlots(s);
  const store = storageCapacity(s);
  const grip = s.effector.type === 'claw' ? '1 piece in the claw' : s.effector.type === 'dual' ? '1 Pin + 1 Cup in the grips' : '1 Pin + 1 Cup + 1 stack';
  const limit = poss.stacks > 0 ? `${poss.pins} Pin, ${poss.cups} Cup and ${poss.stacks} stack` : `${poss.pins} Pin and ${poss.cups} Cup`;
  const capacity = `Holds ${grip}${store ? ` plus ${store} in the intake` : ''}. Rule ${poss.ruleId} allows ${limit}; extras are refused.`;
  if (slots.length + store > poss.pins + poss.cups + poss.stacks) warnings.push('This robot can hold more pieces than the possession limit allows; extra pieces will be refused.');
  return { ok: errors.length === 0, errors, warnings, driveW, totalW, maxLength, maxWidth, maxHeight, capacity, airActuations: needsAir ? pneumaticBudget(s) : 0 };
}
