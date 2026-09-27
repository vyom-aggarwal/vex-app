import * as THREE from 'three';
import type { GameDefinition } from '../engine/types';
import { lerpAngle } from '../shared/math';
import type { Alliance, PinType, RobotSpec } from '../shared/types';
import { inToM } from '../shared/units';
import { buildField } from './field';
import { COLORS, setFlat, shadowAll } from './materials';
import { cupMesh, pinMesh } from './pieces';
import { RobotMesh } from './robot';

export type Quality = 'low' | 'medium' | 'high';
export type CameraMode = 'driver' | 'driverTrack' | 'chase' | 'overhead' | 'audience';
export const CAMERA_MODES: CameraMode[] = ['driver', 'driverTrack', 'chase', 'overhead', 'audience'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  driver: 'Driver Station',
  driverTrack: 'Driver Station (tracking)',
  chase: 'Chase',
  overhead: 'Overhead 2D',
  audience: 'Audience',
};

/** What the renderer needs to know about the world (plain data, from Sim or a replay). */
export interface WorldInfo {
  objects: { kind: 'pin' | 'cup'; pin: PinType | null; hidden: boolean }[];
  robots: { spec: RobotSpec; alliance: Alliance }[];
}

const e2t = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, z, -y);

/**
 * One WebGL context for the whole app: matches, replays and the builder turntable all render through
 * this class. Scene content lives under `root`, rotated so engine coordinates (z up) can be used directly.
 */
export class ZRenderer {
  renderer!: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private persp = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  private ortho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
  private hemi = new THREE.HemisphereLight(0xdfe8ff, 0x30343a, 1.1);
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private fieldGroup: THREE.Group | null = null;
  private detents: THREE.Group[] = [];
  private objMeshes: THREE.Group[] = [];
  private robotMeshes: RobotMesh[] = [];
  private previewGroup: THREE.Group | null = null;
  private previewRobot: RobotMesh | null = null;
  private previewAngle = 0;
  private quality: Quality = 'medium';
  private aa = true;
  private flat = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  mode: CameraMode = 'driver';
  alliance: Alliance = 'red';
  fieldSize = 3.57;

  constructor(quality: Quality) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'zd-canvas';
    this.quality = quality;
    this.aa = quality !== 'low';
    this.createRenderer();
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root, this.hemi, this.sun, this.sun.target);
    this.scene.background = new THREE.Color(COLORS.bg);
    this.sun.position.set(-2, 6, 3);
    this.sun.shadow.camera.left = -3;
    this.sun.shadow.camera.right = 3;
    this.sun.shadow.camera.top = 3;
    this.sun.shadow.camera.bottom = -3;
    this.sun.shadow.bias = -0.0005;
    this.setQuality(quality);
  }

  private createRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.aa, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  setQuality(q: Quality): void {
    const wantAA = q !== 'low';
    if (wantAA !== this.aa) {
      // Antialiasing is fixed per context: replace it (the old one is released first, so still one context).
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.aa = wantAA;
      this.createRenderer();
    }
    this.quality = q;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(1, dpr) * 0.85 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    const shadows = q !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }

  resize(): void {
    const p = this.canvas.parentElement;
    const w = p?.clientWidth || 800;
    const h = p?.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const half = (this.fieldSize / 2) * 1.08;
    const a = w / h;
    this.ortho.left = -half * Math.max(1, a);
    this.ortho.right = half * Math.max(1, a);
    this.ortho.top = half * Math.max(1, 1 / a);
    this.ortho.bottom = -half * Math.max(1, 1 / a);
    this.ortho.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------------------------
  // Match world
  // -------------------------------------------------------------------------------------------

  private clearWorld(): void {
    for (const m of this.objMeshes) this.root.remove(m);
    for (const r of this.robotMeshes) {
      this.root.remove(r.group);
      r.dispose();
    }
    this.objMeshes = [];
    this.robotMeshes = [];
  }

  loadGame(game: GameDefinition): void {
    this.clearPreview();
    this.clearWorld();
    if (this.fieldGroup) this.root.remove(this.fieldGroup);
    const f = buildField(game.field);
    this.fieldGroup = f.group;
    this.detents = f.detents;
    this.fieldSize = inToM(game.field.size);
    shadowAll(this.fieldGroup, false, true);
    this.root.add(this.fieldGroup);
    this.camInit = false;
    this.applyFlat();
    this.resize();
  }

  get objectCount(): number {
    return this.objMeshes.length;
  }

  setWorld(w: WorldInfo): void {
    this.clearWorld();
    this.syncObjects(w);
    for (const r of w.robots) {
      const m = new RobotMesh(r.spec, r.alliance);
      shadowAll(m.group, true, true);
      this.robotMeshes.push(m);
      this.root.add(m.group);
    }
    this.applyFlat();
  }

  /** Add meshes for objects spawned since the last call (Free Drive). */
  syncObjects(w: WorldInfo): void {
    for (let i = this.objMeshes.length; i < w.objects.length; i++) {
      const o = w.objects[i];
      const m = o.kind === 'pin' ? pinMesh(o.pin ?? 'YY') : cupMesh();
      shadowAll(m, true, false);
      if (this.flat) setFlat(m, true);
      this.objMeshes.push(m);
      this.root.add(m);
    }
    w.objects.forEach((o, i) => (this.objMeshes[i].visible = !o.hidden));
  }

  /** Apply interpolated poses (Sim.poses() layout). */
  applyPoses(prev: Float32Array, cur: Float32Array, alpha: number): void {
    const n = this.objMeshes.length;
    const lerp = (i: number) => prev[i] + (cur[i] - prev[i]) * alpha;
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const same = prev.length === cur.length;
    const P = same ? prev : cur;
    let i = 0;
    for (let k = 0; k < n && i + 7 <= cur.length; k++, i += 7) {
      const m = this.objMeshes[k];
      if (!same) {
        m.position.set(cur[i], cur[i + 1], cur[i + 2]);
        m.quaternion.set(cur[i + 3], cur[i + 4], cur[i + 5], cur[i + 6]);
        continue;
      }
      m.position.set(lerp(i), lerp(i + 1), lerp(i + 2));
      qa.set(P[i + 3], P[i + 4], P[i + 5], P[i + 6]);
      qb.set(cur[i + 3], cur[i + 4], cur[i + 5], cur[i + 6]);
      m.quaternion.slerpQuaternions(qa, qb, alpha);
    }
    for (const r of this.robotMeshes) {
      const x = same ? lerp(i) : cur[i];
      const y = same ? lerp(i + 1) : cur[i + 1];
      const z = same ? lerp(i + 2) : cur[i + 2];
      const th = same ? lerpAngle(P[i + 3], cur[i + 3], alpha) : cur[i + 3];
      r.group.position.set(x, y, z);
      r.group.rotation.set(0, 0, th);
      r.update(same ? lerp(i + 4) : cur[i + 4], same ? lerp(i + 5) : cur[i + 5]);
      i += 6;
    }
    for (const d of this.detents) {
      const a = same ? lerpAngle(P[i], cur[i], alpha) : cur[i];
      (d.userData.spin as THREE.Group).rotation.x = a;
      i++;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Cameras
  // -------------------------------------------------------------------------------------------

  setCamera(mode: CameraMode): void {
    this.mode = mode;
    const flat = mode === 'overhead';
    if (flat !== this.flat) {
      this.flat = flat;
      this.applyFlat();
    }
    this.camInit = false;
  }

  private applyFlat(): void {
    setFlat(this.root, this.flat);
    this.sun.visible = !this.flat;
    this.hemi.intensity = this.flat ? 2.2 : 1.1;
  }

  /** Update the active camera to follow robot `focus` (index into the robot list). */
  private updateCamera(focus: number, dt: number): THREE.Camera {
    const S = this.fieldSize;
    const side = this.alliance === 'red' ? 1 : -1;
    const r = this.robotMeshes[focus]?.group;
    const rp = r ? r.position : new THREE.Vector3();
    const th = r ? r.rotation.z : 0;
    if (this.mode === 'overhead') {
      this.ortho.position.copy(e2t(0, 0, 8));
      this.ortho.up.copy(e2t(0, -side, 0));
      this.ortho.lookAt(e2t(0, 0, 0));
      return this.ortho;
    }
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    switch (this.mode) {
      case 'driver':
        pos = e2t(0, side * (S / 2 + 0.85), 1.55);
        look = e2t(0, -side * 0.2, 0);
        break;
      case 'driverTrack':
        pos = e2t(0, side * (S / 2 + 0.85), 1.55);
        look = e2t(rp.x, rp.y, 0.1);
        break;
      case 'chase':
        pos = e2t(rp.x - Math.cos(th) * 1.0, rp.y - Math.sin(th) * 1.0, 0.75);
        look = e2t(rp.x + Math.cos(th) * 0.6, rp.y + Math.sin(th) * 0.6, 0.1);
        break;
      default:
        pos = e2t(-(S / 2 + 1.4), 0, 2.1);
        look = e2t(0, 0, 0);
    }
    const k = this.camInit ? 1 - Math.exp(-dt * (this.mode === 'chase' ? 6 : 8)) : 1;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    if (!this.camInit) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camInit = true;
    }
    this.persp.up.set(0, 1, 0);
    this.persp.position.copy(this.camPos);
    this.persp.lookAt(this.camLook);
    return this.persp;
  }

  render(focus: number, dt: number): void {
    const cam = this.updateCamera(focus, dt);
    this.renderer.render(this.scene, cam);
  }

  // -------------------------------------------------------------------------------------------
  // Builder turntable (same scene graph code, same context)
  // -------------------------------------------------------------------------------------------

  private clearPreview(): void {
    if (this.previewGroup) this.root.remove(this.previewGroup);
    this.previewRobot?.dispose();
    this.previewGroup = null;
    this.previewRobot = null;
  }

  showPreview(spec: RobotSpec, envelope: { footprint: number; height: number | null }): void {
    this.clearPreview();
    if (this.fieldGroup) this.fieldGroup.visible = false;
    for (const m of this.objMeshes) m.visible = false;
    for (const r of this.robotMeshes) r.group.visible = false;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshStandardMaterial({ color: COLORS.tile, roughness: 0.95 }));
    pad.receiveShadow = true;
    g.add(pad);
    const robot = new RobotMesh(spec, null);
    shadowAll(robot.group, true, true);
    g.add(robot.group);
    // Expansion envelope (footprint × height) as a wireframe box.
    const H = inToM(envelope.height ?? 60);
    const F = inToM(envelope.footprint);
    const env = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(F, F, H)),
      new THREE.LineBasicMaterial({ color: envelope.height === null ? 0x6aa6ff : 0xf2c230, transparent: true, opacity: 0.5 }),
    );
    env.position.z = H / 2;
    g.add(env);
    const start = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(inToM(18), inToM(18), inToM(18))),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    );
    start.position.z = inToM(9);
    g.add(start);
    this.previewGroup = g;
    this.previewRobot = robot;
    this.root.add(g);
    this.flat = false;
    this.applyFlat();
  }

  /** Preview lift/wrist pose so the builder can show the robot raised. */
  previewPose(lift: number, wrist: number): void {
    this.previewRobot?.update(lift, wrist);
  }

  renderPreview(dt: number): void {
    if (!this.previewGroup) return;
    this.previewAngle += dt * 0.6;
    this.previewRobot!.group.rotation.z = this.previewAngle;
    this.persp.up.set(0, 1, 0);
    this.persp.position.copy(e2t(1.05, -0.75, 0.8));
    this.persp.lookAt(e2t(0, 0, 0.2));
    this.renderer.render(this.scene, this.persp);
  }

  /** Thumbnail from the live preview (render + read back in the same task). */
  thumbnail(size = 160): string {
    this.renderPreview(0);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!g) return '';
    const s = Math.min(src.width, src.height);
    g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.8);
  }

  endPreview(): void {
    this.clearPreview();
    if (this.fieldGroup) this.fieldGroup.visible = true;
    for (const r of this.robotMeshes) r.group.visible = true;
  }

  dispose(): void {
    this.clearPreview();
    this.clearWorld();
    this.renderer.dispose();
  }
}
