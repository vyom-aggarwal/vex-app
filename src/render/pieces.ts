import * as THREE from 'three';
import { CUP, PIN } from '../engine/pieces';
import { PIN_HALVES, type PinType } from '../shared/types';
import { inToM } from '../shared/units';
import { COLORS, halfColor, mat } from './materials';

/** Pin and Cup meshes, built along local +z (engine frame): pin half 0 / cup clear half at +z. */

let pinHalfGeo: THREE.BufferGeometry | null = null;
let collarGeo: THREE.BufferGeometry | null = null;
let cupHalfGeo: THREE.BufferGeometry | null = null;

function lathe(points: [number, number][], segs: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(inToM(r), inToM(y))),
    segs,
  );
  g.rotateX(Math.PI / 2); // lathe axis +y → +z
  return g;
}

function geos(): void {
  if (pinHalfGeo) return;
  const c = PIN.collarThick / 2;
  pinHalfGeo = lathe(
    [
      [0, c],
      [PIN.coneBase / 2, c],
      [PIN.tip / 2 + 0.05, PIN.half - 0.05],
      [PIN.tip / 2, PIN.half],
      [0, PIN.half],
    ],
    18,
  );
  collarGeo = new THREE.CylinderGeometry(inToM(PIN.collarAC / 2), inToM(PIN.collarAC / 2), inToM(PIN.collarThick), 6);
  collarGeo.rotateX(Math.PI / 2);
  cupHalfGeo = lathe(
    [
      [CUP.waist / 2, 0],
      [CUP.rim / 2, CUP.half - 0.1],
      [CUP.rim / 2 - 0.04, CUP.half],
      [CUP.rim / 2 - 0.12, CUP.half - 0.1],
      [CUP.waist / 2 - 0.12, 0.05],
    ],
    24,
  );
}

export function pinMesh(type: PinType): THREE.Group {
  geos();
  const [c0, c1] = PIN_HALVES[type];
  const g = new THREE.Group();
  const top = new THREE.Mesh(pinHalfGeo!, mat(halfColor(c0), { rough: 0.5 }));
  const bot = new THREE.Mesh(pinHalfGeo!, mat(halfColor(c1), { rough: 0.5 }));
  bot.rotation.x = Math.PI;
  const collar = new THREE.Mesh(collarGeo!, mat(COLORS.white, { rough: 0.5 }));
  g.add(top, bot, collar);
  return g;
}

export function cupMesh(): THREE.Group {
  geos();
  const g = new THREE.Group();
  const clear = new THREE.Mesh(cupHalfGeo!, mat(COLORS.cupClear, { opacity: 0.38, rough: 0.2 }));
  const opaque = new THREE.Mesh(cupHalfGeo!, mat(COLORS.cupOpaque, { rough: 0.6 }));
  opaque.rotation.x = Math.PI;
  clear.renderOrder = 2;
  g.add(clear, opaque);
  return g;
}
