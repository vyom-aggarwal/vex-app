import * as THREE from 'three';
import { buildDriveModel } from '../engine/drivetrain';
import { CHASSIS_BASE, CLEARANCE, armPivot, effectorPoint, liftRange } from '../engine/mechanism';
import type { Alliance, RobotSpec } from '../shared/types';
import { inToM } from '../shared/units';
import { COLORS, mat } from './materials';

const plateCache = new Map<string, THREE.CanvasTexture>();

/** License plate: team number (or robot name) in white on the alliance/accent color. */
function plateTexture(num: string, color: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${num}:${color}`;
  const hit = plateCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 56;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 256, 56);
  g.fillStyle = '#ffffff';
  g.font = `600 ${num.length > 8 ? 30 : 38}px 'Inter Variable', system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(num.slice(0, 14) || 'ZDRIVE', 128, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  plateCache.set(key, t);
  return t;
}

/** A robot built from its spec, in the engine robot frame (+x forward, +y left, +z up), meters. */
export class RobotMesh {
  readonly group = new THREE.Group();
  private carriage = new THREE.Group();
  private arm: THREE.Mesh | null = null;
  private claw = new THREE.Group();
  private spec: RobotSpec;
  /** Meshes per builder part (chassis, drive, intake, lift, effector, tool, pneumatics) for highlighting. */
  private parts = new Map<string, THREE.Object3D[]>();

  private add(part: string, o: THREE.Object3D, parent: THREE.Object3D = this.group): void {
    parent.add(o);
    const list = this.parts.get(part) ?? [];
    list.push(o);
    this.parts.set(part, list);
  }

  /** Bounding box of a part in this robot's local frame (null if the robot has no such part). */
  partBox(part: string): THREE.Box3 | null {
    const list = this.parts.get(part);
    if (!list?.length) return null;
    this.group.updateMatrixWorld(true);
    const inv = this.group.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const o of list)
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        box.union(tmp);
      });
    return box.isEmpty() ? null : box.expandByScalar(inToM(0.4));
  }

  constructor(spec: RobotSpec, alliance: Alliance | null) {
    this.spec = spec;
    const m = (w: number, d: number, h: number, color: number, x: number, y: number, z: number, o: { metal?: number } = {}): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(inToM(w), inToM(d), inToM(h)), mat(color, { metal: o.metal ?? 0.3, rough: 0.55 }));
      mesh.position.set(inToM(x), inToM(y), inToM(z));
      return mesh;
    };
    const c = spec.chassis;
    const baseH = CHASSIS_BASE - CLEARANCE;
    const team = spec.look?.accent ?? (alliance ? COLORS[alliance] : 0x8a93a0);
    const frame = spec.look?.chassis ?? COLORS.metal;
    // Drive base: side rails, cross members, bumpers in alliance color.
    this.add('chassis', m(c.length, 1, baseH, frame, 0, c.width / 2 - 0.5, CLEARANCE + baseH / 2));
    this.add('chassis', m(c.length, 1, baseH, frame, 0, -c.width / 2 + 0.5, CLEARANCE + baseH / 2));
    this.add('chassis', m(1, c.width - 2, 1, COLORS.darkMetal, c.length / 2 - 1.5, 0, CLEARANCE + 1));
    this.add('chassis', m(1, c.width - 2, 1, COLORS.darkMetal, -c.length / 2 + 1.5, 0, CLEARANCE + 1));
    this.add('chassis', m(c.length - 2, c.width - 2, 0.25, COLORS.darkMetal, 0, 0, CHASSIS_BASE - 0.3));
    this.add('chassis', m(c.length + 0.4, 0.6, 2.2, team, 0, c.width / 2 + 0.3, 2.3));
    this.add('chassis', m(c.length + 0.4, 0.6, 2.2, team, 0, -c.width / 2 - 0.3, 2.3));
    // Team number license plates on both sides.
    const plate = plateTexture((spec.team?.number || spec.name || '').trim(), team);
    if (plate) {
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(inToM(Math.min(9, c.length - 2)), inToM(2)), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6 }));
        p.position.set(0, inToM(s * (c.width / 2 + 0.62)), inToM(2.3));
        // Front face outward (±y) with the text upright: +y side needs an extra half-turn about Y.
        p.rotation.set(Math.PI / 2, s > 0 ? Math.PI : 0, 0);
        this.add('chassis', p);
      }
    }
    // Wheels
    const dm = buildDriveModel(spec);
    const r = spec.drive.wheelDia / 2;
    const wheelGeo = new THREE.CylinderGeometry(inToM(r), inToM(r), inToM(1.1), 18);
    for (const w of dm.wheels) {
      const mesh = new THREE.Mesh(wheelGeo, mat(w.omni ? COLORS.omni : COLORS.rubber, { rough: 0.9 }));
      // Cylinder axis is +y; the axle is perpendicular to the rolling direction.
      mesh.rotation.z = w.dir;
      const inset = Math.abs(w.y) > 0.01 ? Math.sign(w.y) * -0.6 : 0;
      mesh.position.set(w.x, w.y + inToM(inset), inToM(r));
      this.add('drive', mesh);
    }
    // Tower
    const towerH = c.height - CHASSIS_BASE;
    if (towerH > 1) {
      this.add('chassis', m(1, 1, towerH, COLORS.metal, -c.length * 0.25, c.width * 0.33, CHASSIS_BASE + towerH / 2));
      this.add('chassis', m(1, 1, towerH, COLORS.metal, -c.length * 0.25, -c.width * 0.33, CHASSIS_BASE + towerH / 2));
      this.add('chassis', m(1.2, c.width * 0.7, 1, COLORS.darkMetal, -c.length * 0.25, 0, c.height - 0.5));
      // Brain + battery
      this.add('chassis', m(4, 3, 1.2, COLORS.black, -c.length * 0.1, 0, CHASSIS_BASE + 0.6));
      this.add('chassis', m(3, 2.6, 1.2, team, -c.length * 0.35, 0, CHASSIS_BASE + 0.6));
    }
    // Lift
    const lt = spec.lift.type;
    const { zMax } = liftRange(spec);
    if (lt === 'dr4b' || lt === 'cascade' || lt === 'sixbar') {
      const x = c.length / 2 - 1;
      for (const s of [1, -1]) this.add('lift', m(1, 1, Math.max(4, zMax * 0.55), COLORS.metal, x - 1.5, (s * c.width) / 2.6, CHASSIS_BASE + zMax * 0.27));
    }
    const piv = armPivot(spec);
    if (piv) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(inToM(piv.r), inToM(1), inToM(1)), mat(COLORS.metal, { metal: 0.4 }));
      arm.geometry.translate(inToM(piv.r / 2), 0, 0);
      arm.position.set(inToM(piv.x), 0, inToM(piv.z));
      this.arm = arm;
      this.add('lift', arm);
      this.add('lift', m(1.2, c.width * 0.6, 1.2, COLORS.darkMetal, piv.x, 0, piv.z));
    }
    // Carriage + claw at the effector point.
    const slots = spec.effector.type === 'claw' ? [0] : [1.8, -1.8];
    this.claw.add(m(0.6, spec.effector.type === 'claw' ? 5 : 8, 2.2, COLORS.darkMetal, -2.4, 0, 0));
    for (const y of slots) {
      this.claw.add(m(2.6, 0.4, 1.4, COLORS.metal, -1.0, y + 1.6, 0));
      this.claw.add(m(2.6, 0.4, 1.4, COLORS.metal, -1.0, y - 1.6, 0));
    }
    this.carriage.add(this.claw);
    this.add('effector', this.carriage);
    // Intake rollers
    if (spec.intake.type !== 'none') {
      const roller = new THREE.CylinderGeometry(inToM(0.9), inToM(0.9), inToM(Math.min(c.width - 2, 12)), 12);
      const addRoller = (x: number) => {
        const mesh = new THREE.Mesh(roller, mat(spec.intake.type === 'flex' ? COLORS.rubber : COLORS.darkMetal, { rough: 0.8 }));
        mesh.position.set(inToM(x), 0, inToM(2));
        this.add('intake', mesh);
      };
      if (spec.intake.mount !== 'back') addRoller(c.length / 2 + 0.8);
      if (spec.intake.mount !== 'front') addRoller(-c.length / 2 - 0.8);
    }
    // Toggle / roller tool on the top front.
    const tool = spec.tool.type;
    if (tool !== 'none') {
      const len = tool === 'flipper' ? 5 : tool === 'wedge' ? 3.5 : 2.5;
      const t = m(len, tool === 'spinner' ? 1.5 : 3, 0.8, tool === 'spinner' ? COLORS.rubber : COLORS.metal, c.length / 2 + len / 2 - 1, 0, Math.max(10, c.height - 1));
      this.add('tool', t);
    }
    // Pneumatic tanks
    for (let i = 0; i < spec.pneumatics.tanks; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(inToM(0.8), inToM(0.8), inToM(5), 10), mat(0x2b2f36, { metal: 0.6 }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(inToM(-c.length / 2 + 3), inToM((i ? -1 : 1) * 3), inToM(CHASSIS_BASE + 1));
      this.add('pneumatics', tank);
    }
    this.update(0, 0);
  }

  update(lift: number, wrist: number): void {
    const e = effectorPoint(this.spec, lift);
    this.carriage.position.set(inToM(e.x), 0, inToM(e.z));
    this.claw.rotation.x = Math.PI * wrist;
    if (this.arm) {
      const piv = armPivot(this.spec)!;
      this.arm.rotation.y = -Math.atan2(e.z - piv.z, e.x - piv.x);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}
