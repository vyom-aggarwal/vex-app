/** Fixed-timestep accumulator: run the sim at a constant rate, render with interpolation alpha. */
export const TICK_HZ = 120;
export const DT = 1 / TICK_HZ;
export const MAX_STEPS_PER_FRAME = 24;

export const secondsToTicks = (s: number): number => Math.round(s * TICK_HZ);

export class FixedTimestep {
  private acc = 0;
  constructor(
    readonly dt = DT,
    readonly maxSteps = MAX_STEPS_PER_FRAME,
  ) {}

  /** Feed wall-clock seconds; calls step() zero or more times. Returns steps taken. */
  advance(elapsedSec: number, step: () => void): number {
    this.acc += Math.min(0.1, Math.max(0, elapsedSec));
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      step();
      this.acc -= this.dt;
      steps++;
    }
    // Spiral-of-death guard: drop the backlog instead of trying to catch up.
    if (steps === this.maxSteps) this.acc = 0;
    return steps;
  }

  /** Interpolation factor between the previous and current sim states. */
  get alpha(): number {
    return this.acc / this.dt;
  }

  reset(): void {
    this.acc = 0;
  }
}
