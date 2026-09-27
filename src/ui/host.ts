import { useEffect, useState } from 'react';
import type { GameDefinition } from '../engine/types';
import type { ZRenderer } from '../render/renderer';
import type { GameId } from '../shared/types';
import type { Quality } from './settings';

/** Lazy singletons: the three.js renderer (one WebGL context for the app) and game definitions. */

let rendererP: Promise<ZRenderer> | null = null;

export function getRenderer(quality: Quality): Promise<ZRenderer> {
  rendererP ??= import('../render/renderer').then((m) => new m.ZRenderer(quality));
  return rendererP;
}

/** Move the shared canvas into `el` and keep it sized. Returns a detach function. */
export function attachCanvas(r: ZRenderer, el: HTMLElement): () => void {
  el.appendChild(r.canvas);
  r.resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => r.resize()) : null;
  ro?.observe(el);
  return () => {
    ro?.disconnect();
    if (r.canvas.parentElement === el) el.removeChild(r.canvas);
  };
}

const gameCache = new Map<GameId, Promise<GameDefinition>>();

export function loadGame(id: GameId): Promise<GameDefinition> {
  let p = gameCache.get(id);
  if (!p) {
    p = id === 'override' ? import('../games/override').then((m) => m.OVERRIDE) : import('../games/pinnacle').then((m) => m.PINNACLE);
    gameCache.set(id, p);
  }
  return p;
}

export function useGame(id: GameId): GameDefinition | null {
  const [g, setG] = useState<GameDefinition | null>(null);
  useEffect(() => {
    let live = true;
    setG(null);
    void loadGame(id).then((d) => live && setG(d));
    return () => {
      live = false;
    };
  }, [id]);
  return g;
}
