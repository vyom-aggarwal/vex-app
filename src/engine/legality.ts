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
  if (c.length > rules.startMax || c.width > rules.startMax || c.height > rules.startMax)
    errors.push(`Starting size must be ≤ ${rules.startMax}" in every direction.`);
  if (rules.driveWatts !== null && driveW > rules.driveWatts) errors.push(`Drivetrain motors total ${driveW} W (cap ${rules.driveWatts} W).`);
  if (totalW > rules.totalWatts) errors.push(`Motors total ${totalW} W (cap ${rules.totalWatts} W).`);
  if (s.effector.type === 'stack' && !rules.allowStackGripper) errors.push('Stack gripper is not available in this game.');
  if ((s.drive.type === 'xdrive' || s.drive.type === 'mecanum') && s.drive.motorsPerSide.length !== 2)
    errors.push('X-drive and mecanum need exactly one motor per wheel (2 per side).');
  if (s.drive.type === 'hdrive' && s.drive.strafeMotors.length === 0) errors.push('H-drive needs at least one center-wheel motor.');
  if (s.drive.motorsPerSide.length === 0) errors.push('Drivetrain needs motors.');
  let maxLength = 0;
  let maxHeight = 0;
  for (let i = 0; i <= 20; i++) {
    const f = footprintX(s, i / 20);
    maxLength = Math.max(maxLength, f.max - f.min);
    maxHeight = Math.max(maxHeight, robotHeight(s, i / 20));
  }
  const maxWidth = c.width;
  if (maxLength > rules.footprintMax || maxWidth > rules.footprintMax)
    errors.push(`Expanded footprint ${maxLength.toFixed(1)}" × ${maxWidth.toFixed(1)}" exceeds ${rules.footprintMax}" × ${rules.footprintMax}".`);
  if (rules.heightMax !== null && maxHeight > rules.heightMax) errors.push(`Raised height ${maxHeight.toFixed(1)}" exceeds ${rules.heightMax}".`);
  if (rules.maxTanks !== null && s.pneumatics.tanks > rules.maxTanks) errors.push(`At most ${rules.maxTanks} air tanks.`);
  const needsAir = s.effector.actuation === 'pneumatic' || s.tool.type === 'flipper';
  if (needsAir && s.pneumatics.tanks === 0) errors.push('Pneumatic parts need at least one air tank.');
  if (needsAir && s.pneumatics.cylinders === 0) errors.push('Pneumatic parts need at least one cylinder.');
  if (s.lift.type !== 'none' && s.lift.motors.length === 0) warnings.push('Lift has no motors, so it cannot move.');
  if (s.intake.type !== 'none' && s.intake.motors.length === 0) warnings.push('Intake has no motors.');
  if (s.tool.type === 'spinner' && s.tool.motors.length === 0) warnings.push('Spinner wheel has no motor.');
  if (s.effector.wrist && s.effector.actuation === 'motor' && s.effector.motors.length === 0) warnings.push('Motor wrist needs an effector motor.');
  const slots = effectorSlots(s);
  const store = storageCapacity(s);
  const grip = s.effector.type === 'claw' ? '1 piece in the claw' : s.effector.type === 'dual' ? '1 Pin + 1 Cup in the grips' : '1 Pin + 1 Cup + 1 stack';
  const limit = poss.stacks > 0 ? `${poss.pins} Pin, ${poss.cups} Cup and ${poss.stacks} stack` : `${poss.pins} Pin and ${poss.cups} Cup`;
  const capacity = `Holds ${grip}${store ? ` plus ${store} in the intake` : ''}. Rule ${poss.ruleId} allows ${limit}; extras are refused.`;
  if (slots.length + store > poss.pins + poss.cups + poss.stacks) warnings.push('This robot can reach for more than the possession limit; extra pieces will be refused.');
  return { ok: errors.length === 0, errors, warnings, driveW, totalW, maxLength, maxWidth, maxHeight, capacity, airActuations: needsAir ? pneumaticBudget(s) : 0 };
}
