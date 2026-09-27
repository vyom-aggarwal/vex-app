/** mulberry32 over a state field, so the generator lives inside the serializable sim state. */
export function nextRandom(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Standalone seeded generator for code that doesn't carry a state object. */
export function makeRng(seed: number): () => number {
  const s = { rng: seed | 0 };
  return () => nextRandom(s);
}
