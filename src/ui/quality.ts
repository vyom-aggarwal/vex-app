import type { Quality, QualitySetting } from './settings';

const ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];

/** Starting tier for "Auto": modest on phones / low-core machines, High elsewhere. */
export function resolveQuality(q: QualitySetting): Quality {
  if (q !== 'auto') return q;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const mobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile || cores <= 4 ? 'medium' : 'high';
}

/**
 * Auto quality: measures real frames in 2 s windows and drops one tier when a window averages under
 * 40 fps. Never raises the tier again during a session (avoids oscillating).
 */
export class AutoQuality {
  private frames = 0;
  private time = 0;
  private settle = 1.5;
  constructor(private enabled: boolean) {}

  /** Returns the lower tier to switch to, or null. */
  frame(dt: number, current: Quality): Quality | null {
    if (!this.enabled) return null;
    if (this.settle > 0) {
      this.settle -= dt;
      return null;
    }
    this.frames++;
    this.time += dt;
    if (this.time < 2) return null;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const i = ORDER.indexOf(current);
    if (fps < 40 && i > 0) {
      this.settle = 1.5;
      return ORDER[i - 1];
    }
    return null;
  }
}
