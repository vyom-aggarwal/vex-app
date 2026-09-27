import * as THREE from 'three';
import type { HalfColor } from '../shared/types';

/** Shared palette + material cache. Every mesh keeps a flat twin for the 2D view. */

export const COLORS = {
  red: 0xd9303a,
  blue: 0x2f6fdc,
  yellow: 0xf2c230,
  tile: 0x3b3f47,
  tileLine: 0x2a2d33,
  wall: 0xb9c3cc,
  wallPanel: 0xdfe8ee,
  neutral: 0x24262b,
  cupClear: 0xdfe8ee,
  cupOpaque: 0x5b6067,
  metal: 0x9aa3ad,
  darkMetal: 0x5d646d,
  rubber: 0x1c1d20,
  omni: 0x6c7580,
  white: 0xf1f3f5,
  black: 0x111214,
  bg: 0x121418,
};

export const halfColor = (c: HalfColor): number => COLORS[c];

const cache = new Map<string, THREE.Material>();

export function mat(color: number, opts: { opacity?: number; rough?: number; metal?: number; emissive?: number } = {}): THREE.MeshStandardMaterial {
  const key = `s:${color}:${opts.opacity ?? 1}:${opts.rough ?? 0.7}:${opts.metal ?? 0}:${opts.emissive ?? 0}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.7,
      metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      side: (opts.opacity ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: (opts.opacity ?? 1) >= 1,
      emissive: opts.emissive ?? 0,
    });
    cache.set(key, m);
  }
  return m;
}

function flatTwin(m: THREE.Material): THREE.Material {
  const key = `f:${m.uuid}`;
  let f = cache.get(key);
  if (!f) {
    const s = m as THREE.MeshStandardMaterial;
    f = new THREE.MeshBasicMaterial({
      color: s.color ?? new THREE.Color(0xffffff),
      map: s.map ?? null,
      transparent: s.transparent,
      opacity: s.opacity,
      side: s.side,
      depthWrite: s.depthWrite,
      vertexColors: s.vertexColors,
    });
    cache.set(key, f);
  }
  return f;
}

/** Swap every mesh under `root` between lit and flat materials. */
export function setFlat(root: THREE.Object3D, flat: boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const ud = mesh.userData as { lit?: THREE.Material | THREE.Material[] };
    if (flat) {
      if (!ud.lit) ud.lit = mesh.material;
      mesh.material = Array.isArray(ud.lit) ? ud.lit.map(flatTwin) : flatTwin(ud.lit);
    } else if (ud.lit) {
      mesh.material = ud.lit;
      delete ud.lit;
    }
  });
}

export function shadowAll(root: THREE.Object3D, cast: boolean, receive: boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
}
