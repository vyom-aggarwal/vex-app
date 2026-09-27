import * as THREE from 'three';
import type { DetentDef, FieldDef } from '../engine/types';
import { inToM } from '../shared/units';
import { COLORS, halfColor, mat } from './materials';

/** Static field meshes, in engine coordinates (meters, z up). Detent meshes are returned for animation. */

const I = inToM;

function tileTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#3b3f47';
  g.fillRect(0, 0, 256, 256);
  // Foam-tile speckle
  for (let i = 0; i < 1400; i++) {
    const v = 52 + ((i * 97) % 18);
    g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
    g.fillRect((i * 53) % 256, (i * 131) % 256, 2, 2);
  }
  g.strokeStyle = '#26292f';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Triangular prism with each face colored by the state it shows (see DetentDef). */
export function detentMesh(d: DetentDef): THREE.Group {
  const R = I(d.side / Math.sqrt(3));
  const L = I(d.length);
  // Build along local +x (the hinge axis) in a frame where local y = inward, z = up.
  const verts = [90, 210, 330].map((a) => new THREE.Vector2(Math.cos((a * Math.PI) / 180) * R, Math.sin((a * Math.PI) / 180) * R));
  const group = new THREE.Group();
  // Face between vertex k and k+1 has outward normal at 150°, 270°, 30° respectively.
  const faceNormals = [150, 270, 30];
  const colorAt = (deg: number) => {
    const target = ((((30 - deg) % 360) + 540) % 360) - 180;
    const hit = d.detents.find((x) => Math.abs(((((x.angle - target) % 360) + 540) % 360) - 180) < 1);
    return hit ? halfColor(hit.color) : COLORS.white;
  };
  for (let k = 0; k < 3; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % 3];
    const w = a.distanceTo(b);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(L, w), mat(colorAt(faceNormals[k]), { rough: 0.5 }));
    const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
    const n = (faceNormals[k] * Math.PI) / 180;
    face.position.set(0, mid.x, mid.y);
    // Plane faces +z by default; tilt it about x so its normal points along (cos n, sin n) in the y-z plane.
    face.rotation.x = Math.atan2(-Math.cos(n), Math.sin(n));
    group.add(face);
  }
  const endGeo = new THREE.CylinderGeometry(R, R, I(0.3), 3);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(endGeo, mat(COLORS.darkMetal));
    cap.rotation.z = Math.PI / 2;
    cap.rotation.x = Math.PI / 2;
    cap.position.x = (s * L) / 2;
    group.add(cap);
  }
  // Orient: local x → hinge axis (inward × up), local y → inward.
  const axis = new THREE.Vector3(d.inward.y, -d.inward.x, 0);
  const inward = new THREE.Vector3(d.inward.x, d.inward.y, 0);
  const up = new THREE.Vector3(0, 0, 1);
  const basis = new THREE.Matrix4().makeBasis(axis, inward, up);
  const holder = new THREE.Group();
  holder.quaternion.setFromRotationMatrix(basis);
  holder.position.set(I(d.pivot.x), I(d.pivot.y), I(d.pivot.z));
  const spin = new THREE.Group();
  spin.add(group);
  holder.add(spin);
  holder.userData.spin = spin;
  return holder;
}

export function buildField(f: FieldDef): { group: THREE.Group; detents: THREE.Group[] } {
  const group = new THREE.Group();
  const S = I(f.size);
  const tex = tileTexture();
  const floorMat = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : COLORS.tile, map: tex, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  // Surrounding floor
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(S * 3, S * 3), mat(0x1b1e23, { rough: 1 }));
  outer.position.z = -0.002;
  outer.receiveShadow = true;
  group.add(outer);
  // Tape
  for (const t of f.tape) {
    const len = I(Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y));
    const color = t.color === 'white' ? COLORS.white : t.color === 'black' ? COLORS.black : COLORS[t.color];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, I(t.width)), mat(color, { rough: 0.8 }));
    m.position.set(I((t.a.x + t.b.x) / 2), I((t.a.y + t.b.y) / 2), 0.001);
    m.rotation.z = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
    m.receiveShadow = true;
    group.add(m);
  }
  // Perimeter: aluminum rails + clear panels.
  const H = I(f.wallHeight);
  const T = I(2);
  for (const [x, y, w, d] of [
    [S / 2 + T / 2, 0, T, S + 2 * T],
    [-S / 2 - T / 2, 0, T, S + 2 * T],
    [0, S / 2 + T / 2, S + 2 * T, T],
    [0, -S / 2 - T / 2, S + 2 * T, T],
  ]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, d, H * 0.8), mat(COLORS.wallPanel, { opacity: 0.25, rough: 0.1 }));
    panel.position.set(x, y, H * 0.4);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, d, I(1)), mat(COLORS.wall, { metal: 0.6, rough: 0.4 }));
    rail.position.set(x, y, H - I(0.5));
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, d, I(1)), mat(COLORS.wall, { metal: 0.6, rough: 0.4 }));
    base.position.set(x, y, I(0.5));
    rail.castShadow = true;
    group.add(panel, rail, base);
  }
  // Goals: octagonal posts.
  for (const g of f.goals) {
    const color = g.owner ? COLORS[g.owner] : COLORS.neutral;
    const r = I(g.width / 2 / Math.cos(Math.PI / 8));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r, I(g.height), 8), mat(color, { rough: 0.45 }));
    body.rotation.x = Math.PI / 2;
    body.rotation.y = Math.PI / 8;
    body.position.set(I(g.x), I(g.y), I(g.height / 2));
    body.castShadow = body.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(I(g.opening / 2 + 0.15), I(0.15), 6, 16), mat(COLORS.white));
    rim.position.set(I(g.x), I(g.y), I(g.height) + 0.001);
    group.add(body, rim);
  }
  // Loaders: tubes on the wall with an alliance band.
  for (const l of f.loaders) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(I(1.7), I(1.7), I(l.h - 3.25), 16, 1, true), mat(COLORS.wallPanel, { opacity: 0.3, rough: 0.1 }));
    tube.rotation.x = Math.PI / 2;
    tube.position.set(I(l.x), I(l.y), I(3.25 + (l.h - 3.25) / 2));
    const band = new THREE.Mesh(new THREE.BoxGeometry(I(l.w), I(l.d), I(1)), mat(COLORS[l.alliance]));
    band.position.set(I(l.x), I(l.y), I(l.h - 0.5));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(I(l.w), I(l.d), I(0.6)), mat(COLORS.wall, { metal: 0.5 }));
    foot.position.set(I(l.x), I(l.y), I(3.25 + 0.3));
    group.add(tube, band, foot);
    if (l.zone) {
      const shade = new THREE.Mesh(
        new THREE.PlaneGeometry(I(Math.abs(l.zone[1].x - l.zone[0].x)), I(Math.abs(l.zone[2].y - l.zone[1].y))),
        mat(COLORS[l.alliance], { opacity: 0.12 }),
      );
      shade.position.set(I((l.zone[0].x + l.zone[2].x) / 2), I((l.zone[0].y + l.zone[2].y) / 2), 0.0015);
      group.add(shade);
    }
  }
  // Driver stations
  for (const s of f.stations) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(I(120), I(40)), mat(COLORS[s.alliance], { opacity: 0.25 }));
    pad.position.set(I(s.x), I(s.y), 0.001);
    group.add(pad);
  }
  const detents = f.detents.map(detentMesh);
  for (const d of detents) group.add(d);
  return { group, detents };
}
