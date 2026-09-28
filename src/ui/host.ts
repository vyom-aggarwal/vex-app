import { useEffect, useState } from 'react';
import type { GameDefinition } from '../engine/types';
import type { WorldInfo, ZRenderer } from '../render/renderer';
import type { GameId, RobotEntry } from '../shared/types';
import { tokenHex } from './appearance';
import type { Quality } from './settings';
import { worldInfoOf } from './world';

/** Lazy singletons: the three.js renderer (one WebGL context for the app) and game definitions. */

let rendererP: Promise<ZRenderer> | null = null;

export function getRenderer(quality: Quality): Promise<ZRenderer> {
  rendererP ??= import('../render/renderer').then((m) => {
    const r = new m.ZRenderer(quality);
    applyPalette(r);
    return r;
  });
  return rendererP;
}

/** Push the current alliance / yellow / background tokens into the 3D scene. */
export function applyPalette(r: ZRenderer): void {
  r.setPalette({
    red: tokenHex('--red', 0xf0525c),
    blue: tokenHex('--blue', 0x4c8df6),
    yellow: tokenHex('--yellow', 0xf2c230),
    bg: tokenHex('--bg-0', 0x0b0d10),
    accent: tokenHex('--accent', 0xa6e35a),
    ok: tokenHex('--ok', 0x3fcf8e),
    warn: tokenHex('--warn', 0xf5b53d),
  });
}

/**
 * Canvas ownership. The one canvas moves between hosts (menu backdrop, builder preview, match,
 * replay); the most recent owner holds it, and releasing hands it back to the previous owner.
 */
interface Owner {
  el: HTMLElement;
  onReclaim?: () => void;
  ro: ResizeObserver | null;
}
const owners: Owner[] = [];

function mount(r: ZRenderer, o: Owner): void {
  if (r.canvas.parentElement !== o.el) o.el.appendChild(r.canvas);
  r.resize();
}

/** Move the shared canvas into `el` and keep it sized. Returns a release function. */
export function attachCanvas(r: ZRenderer, el: HTMLElement, onReclaim?: () => void): () => void {
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => owners[owners.length - 1]?.el === el && r.resize()) : null;
  const o: Owner = { el, onReclaim, ro };
  owners.push(o);
  ro?.observe(el);
  mount(r, o);
  return () => {
    const i = owners.indexOf(o);
    if (i < 0) return;
    const top = i === owners.length - 1;
    owners.splice(i, 1);
    ro?.disconnect();
    if (!top) return;
    const prev = owners[owners.length - 1];
    if (prev) {
      mount(r, prev);
      prev.onReclaim?.();
    } else if (r.canvas.parentElement === el) el.removeChild(r.canvas);
  };
}

/** True while `el` holds the canvas (the backdrop only draws when it does). */
export const ownsCanvas = (el: HTMLElement | null): boolean => !!el && owners[owners.length - 1]?.el === el;

const gameCache = new Map<GameId, Promise<GameDefinition>>();
const resolved = new Map<GameId, GameDefinition>();

export function loadGame(id: GameId): Promise<GameDefinition> {
  let p = gameCache.get(id);
  if (!p) {
    p = (id === 'override' ? import('../games/override').then((m) => m.OVERRIDE) : import('../games/pinnacle').then((m) => m.PINNACLE)).then((d) => {
      resolved.set(id, d);
      return d;
    });
    gameCache.set(id, p);
  }
  return p;
}

/** The game definition (synchronously once it has loaded, so switching games never blanks the screen). */
export function useGame(id: GameId): GameDefinition | null {
  const [g, setG] = useState<GameDefinition | null>(() => resolved.get(id) ?? null);
  useEffect(() => {
    let live = true;
    void loadGame(id).then((d) => live && setG(d));
    return () => {
      live = false;
    };
  }, [id]);
  return resolved.get(id) ?? (g && g.id === id ? g : null);
}

/** Physics (Rapier) loads once; the boot screen waits for it. */
let physicsP: Promise<void> | null = null;
export const loadPhysicsOnce = (): Promise<void> => (physicsP ??= import('../engine/physics').then((m) => m.loadPhysics()));

const ambientCache = new Map<GameId, Promise<{ info: WorldInfo; poses: Float32Array }>>();

/** The starting field of a game (pieces plus one parked robot per alliance) for the menu backdrop. */
export function ambientWorld(def: GameDefinition): Promise<{ info: WorldInfo; poses: Float32Array }> {
  let p = ambientCache.get(def.id);
  if (!p) {
    p = (async () => {
      await loadPhysicsOnce();
      const [{ Sim }, { presetsFor }] = await Promise.all([import('../engine/sim'), import('../games/presets')]);
      const mode = def.modes.find((m) => !m.solo && m.robots.red > 0 && m.robots.blue > 0) ?? def.modes[0];
      const presets = presetsFor(def.id);
      const robots: RobotEntry[] = [
        { spec: presets[1] ?? presets[0], alliance: 'red', driver: 'dummy', slot: 0 },
        { spec: presets[2] ?? presets[0], alliance: 'blue', driver: 'dummy', slot: 0 },
      ].filter((e) => mode.robots[e.alliance as 'red' | 'blue'] > 0) as RobotEntry[];
      const sim = new Sim({ game: def, modeId: mode.id, robots, seed: 7, autoRef: false, worlds: false });
      const out = { info: worldInfoOf(sim), poses: sim.poses().slice() };
      sim.dispose();
      return out;
    })();
    ambientCache.set(def.id, p);
  }
  return p;
}
