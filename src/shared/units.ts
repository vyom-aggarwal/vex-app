/** Game definitions are authored in inches; the engine works in meters. Convert only at that boundary. */
export const M_PER_IN = 0.0254;
export const inToM = (inches: number): number => inches * M_PER_IN;
export const mToIn = (m: number): number => m / M_PER_IN;
export const DEG = Math.PI / 180;
export const G = 9.81;
/** ft/s ↔ m/s */
export const mpsToFps = (v: number): number => v / 0.3048;
