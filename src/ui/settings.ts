import { DEFAULT_TUNING, type DriverTuning } from '../shared/input/mapping';
import { loadJson, saveJson } from '../shared/storage';
import type { Alliance, BotLevel, BotStyle } from '../shared/types';

import type { CameraMode, Quality } from '../render/renderer';

export type { CameraMode, Quality };

export interface Settings extends DriverTuning {
  quality: Quality;
  camera: CameraMode;
  autoRef: boolean;
  worlds: boolean;
  alliance: Alliance;
  botLevel: BotLevel;
  partnerStyle: BotStyle;
  opponentStyle: BotStyle;
  /** Bots use the player's robot instead of presets. */
  botsUseMyRobot: boolean;
  showToasts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_TUNING,
  quality: 'medium',
  camera: 'driver',
  autoRef: true,
  worlds: false,
  alliance: 'red',
  botLevel: 'normal',
  partnerStyle: 'mixed',
  opponentStyle: 'mixed',
  botsUseMyRobot: false,
  showToasts: true,
};

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...loadJson<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings): void => void saveJson('settings', s);
