import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameDefinition } from '../engine/types';
import { lerpAngle } from '../shared/math';
import type { Alliance, PinType, RobotSpec } from '../shared/types';
import { inToM } from '../shared/units';
import { buildField } from './field';
import { COLORS, setFlat, shadowAll } from './materials';
import { cupMesh, pinMesh } from './pieces';
import { RobotMesh } from './robot';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type CameraMode = 'driver' | 'driverTrack' | 'chase' | 'orbit' | 'overhead' | 'audience';
export const CAMERA_MODES: CameraMode[] = ['driver', 'driverTrack', 'chase', 'orbit', 'overhead', 'audience'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  driver: 'Driver Station',
  driverTrack: 'Driver Station (tracking)',
  chase: 'Chase',
  orbit: 'Orbit',
  overhead: 'Overhead 2D',
  audience: 'Audience',
};

/** What the renderer needs to know about the world (plain data, from Sim or a replay). */
export interface WorldInfo {
  objects: { kind: 'pin' | 'cup'; pin: PinType | null; hidden: boolean }[];
  robots: { spec: RobotSpec; alliance: Alliance }[];
}

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  drawMs: number;
}

const e2t = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, z, -y);

/** Pixel ratio, shadow map size and antialiasing per quality tier. */
const TIERS: Record<Quality, { dpr: number; shadow: number; aa: boolean; soft: boolean }> = {
  low: { dpr: 0.85, shadow: 0, aa: false, soft: false },
  medium: { dpr: 1.25, shadow: 1024, aa: true, soft: false },
  high: { dpr: 2, shadow: 2048, aa: true, soft: true },
  ultra: { dpr: 2.5, shadow: 4096, aa: true, soft: true },
};

/**
 * One WebGL context for the whole app: matches, replays and the builder turntable all render through
 * this class. Scene content lives under `root`, rotated so engine coordinates (z up) can be used directly.
 */
export class ZRenderer {
  renderer!: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private persp = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  private ortho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.25);
  private sun = new THREE.DirectionalLight(0xffffff, 2.1);
  private fill = new THREE.DirectionalLight(0xffffff, 0.55);
  private orbit: OrbitControls | null = null;
  private fieldGroup: THREE.Group | null = null;
  private detents: THREE.Group[] = [];
  private objMeshes: THREE.Group[] = [];
  private robotMeshes: RobotMesh[] = [];
  private previewGroup: THREE.Group | null = null;
  private previewRobot: RobotMesh | null = null;
  private previewAngle = 0;
  private preview2d = false;
  private quality: Quality = 'medium';
  private aa = true;
  private flat = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  private lastDraw = 0;
  private guides = new THREE.Group();
  private ambientAngle = 0.6;
  private highlight: THREE.Box3Helper | null = null;
  private highlightColor = 0xa6e35a;
  private okColor = 0x3fcf8e;
  private warnColor = 0xf5b53d;
  private goalRing: THREE.Mesh;
  private grabRing: THREE.Mesh;
  private dropLine: THREE.Mesh;
  private dropDot: THREE.Mesh;
  mode: CameraMode = 'driver';
  alliance: Alliance = 'red';
  fieldSize = 3.57;
  /** Driver height (in); the driver camera sits at eye level (~93% of height). */
  driverHeight = 68;

  constructor(quality: Quality) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'zd-canvas';
    this.quality = quality;
    this.aa = TIERS[quality].aa;
    this.createRenderer();
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root, this.hemi, this.sun, this.sun.target, this.fill);
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLORS.bg, 9, 26);
    this.sun.position.set(-2.2, 6.5, 2.8);
    this.fill.position.set(3, 4, -3);
    const sc = this.sun.shadow.camera;
    sc.left = -2.6;
    sc.right = 2.6;
    sc.top = 2.6;
    sc.bottom = -2.6;
    sc.near = 1;
    sc.far = 14;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const guideMat = (c: number, o = 0.9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
    this.goalRing = new THREE.Mesh(new THREE.TorusGeometry(inToM(1.9), inToM(0.22), 8, 40), guideMat(0x3fdc7f));
    this.grabRing = new THREE.Mesh(new THREE.TorusGeometry(inToM(2.3), inToM(0.14), 8, 40), guideMat(0xf2c230, 0.85));
    const line = new THREE.CylinderGeometry(inToM(0.08), inToM(0.08), 1, 8);
    line.rotateX(Math.PI / 2);
    line.translate(0, 0, 0.5);
    this.dropLine = new THREE.Mesh(line, guideMat(0xffffff, 0.55));
    this.dropDot = new THREE.Mesh(new THREE.CircleGeometry(inToM(0.9), 24), guideMat(0xffffff, 0.35));
    for (const m of [this.goalRing, this.grabRing, this.dropLine, this.dropDot]) {
      m.renderOrder = 10;
      m.visible = false;
      this.guides.add(m);
    }
    this.root.add(this.guides);
    this.setQuality(quality);
  }

  private createRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.aa, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.orbit?.dispose();
    this.orbit = new OrbitControls(this.persp, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.6;
    this.orbit.maxDistance = 9;
    this.orbit.maxPolarAngle = Math.PI * 0.48;
    this.orbit.enabled = this.mode === 'orbit';
  }

  getQuality(): Quality {
    return this.quality;
  }

  setQuality(q: Quality): void {
    const t = TIERS[q];
    if (t.aa !== this.aa) {
      // A canvas keeps its first context, so the replacement renderer gets a fresh canvas.
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      const old = this.canvas;
      this.canvas = document.createElement('canvas');
      this.canvas.className = old.className;
      old.parentElement?.replaceChild(this.canvas, old);
      this.aa = t.aa;
      this.createRenderer();
    }
    this.quality = q;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, t.dpr));
    const shadows = t.shadow > 0;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = t.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = shadows;
    if (shadows) {
      this.sun.shadow.mapSize.set(t.shadow, t.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  setDriverHeight(inches: number): void {
    this.driverHeight = inches;
    this.camInit = false;
  }

  resize(): void {
    const p = this.canvas.parentElement;
    const w = p?.clientWidth || 800;
    const h = p?.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const half = (this.previewGroup ? 0.55 : this.fieldSize / 2) * 1.06;
    const a = w / h;
    this.ortho.left = -half * Math.max(1, a);
    this.ortho.right = half * Math.max(1, a);
    this.ortho.top = half * Math.max(1, 1 / a);
    this.ortho.bottom = -half * Math.max(1, 1 / a);
    this.ortho.updateProjectionMatrix();
  }

  stats(): RenderStats {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, drawMs: this.lastDraw };
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
    for (const d of this.detents) shadowAll(d, true, true);
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

  /** Add meshes for objects spawned since the last call (Free Drive) and update visibility. */
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
    const same = prev.length === cur.length;
    const P = same ? prev : cur;
    const a = same ? Math.min(1, Math.max(0, alpha)) : 1;
    const lerp = (i: number) => P[i] + (cur[i] - P[i]) * a;
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    let i = 0;
    for (let k = 0; k < n && i + 7 <= cur.length; k++, i += 7) {
      const m = this.objMeshes[k];
      m.position.set(lerp(i), lerp(i + 1), lerp(i + 2));
      qa.set(P[i + 3], P[i + 4], P[i + 5], P[i + 6]);
      qb.set(cur[i + 3], cur[i + 4], cur[i + 5], cur[i + 6]);
      m.quaternion.slerpQuaternions(qa, qb, a);
    }
    for (const r of this.robotMeshes) {
      if (i + 6 > cur.length) break;
      r.group.position.set(lerp(i), lerp(i + 1), 0);
      r.group.rotation.set(0, 0, lerpAngle(P[i + 3], cur[i + 3], a));
      r.update(lerp(i + 4), lerp(i + 5));
      i += 6;
    }
    for (const d of this.detents) {
      if (i >= cur.length) break;
      (d.userData.spin as THREE.Group).rotation.x = lerpAngle(P[i], cur[i], a);
      i++;
    }
  }

  /** Placement / grab guides (engine coordinates, meters). Pass null to hide. */
  setGuides(g: { goal: { x: number; y: number; z: number; ok: boolean } | null; drop: { x: number; y: number; z: number } | null; grab: { x: number; y: number; z: number } | null } | null): void {
    const gr = g?.goal;
    this.goalRing.visible = !!gr;
    if (gr) {
      this.goalRing.position.set(gr.x, gr.y, gr.z + 0.004);
      (this.goalRing.material as THREE.MeshBasicMaterial).color.setHex(gr.ok ? this.okColor : this.warnColor);
      this.goalRing.scale.setScalar(gr.ok ? 1.12 : 1);
    }
    const d = g?.drop;
    this.dropLine.visible = this.dropDot.visible = !!d;
    if (d) {
      this.dropLine.position.set(d.x, d.y, 0);
      this.dropLine.scale.set(1, 1, Math.max(0.001, d.z));
      this.dropDot.position.set(d.x, d.y, 0.003);
    }
    const k = g?.grab;
    this.grabRing.visible = !!k;
    if (k) this.grabRing.position.set(k.x, k.y, 0.006);
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
    if (this.orbit) {
      this.orbit.enabled = mode === 'orbit';
      if (mode === 'orbit') {
        const side = this.alliance === 'red' ? 1 : -1;
        this.persp.position.copy(e2t(0, side * (this.fieldSize / 2 + 1.6), 2.6));
        this.orbit.target.copy(e2t(0, 0, 0));
        this.orbit.update();
      }
    }
    this.camInit = false;
  }

  private applyFlat(): void {
    setFlat(this.root, this.flat);
    this.sun.visible = !this.flat;
    this.fill.visible = !this.flat;
    this.hemi.intensity = this.flat ? 2.4 : 1.25;
    this.scene.fog = this.flat || this.previewGroup ? null : new THREE.Fog(COLORS.bg, 9, 26);
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
    if (this.mode === 'orbit' && this.orbit) {
      if (this.persp.fov !== 50) {
        this.persp.fov = 50;
        this.persp.updateProjectionMatrix();
      }
      this.orbit.update();
      return this.persp;
    }
    const eye = inToM(this.driverHeight * 0.93);
    // Drivers stand in the station, about a meter behind the field wall.
    const station = S / 2 + 1.0;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov = 50;
    switch (this.mode) {
      case 'driver':
        // Aim ~33° down so both your own wall (and robot) and the far wall stay in frame.
        pos = e2t(0, side * station, eye);
        look = e2t(0, side * 0.3, 0);
        fov = 58;
        break;
      case 'driverTrack':
        pos = e2t(0, side * station, eye);
        look = e2t(rp.x * 0.85, rp.y * 0.85 - side * 0.15, 0.1);
        fov = 46;
        break;
      case 'chase':
        pos = e2t(rp.x - Math.cos(th) * 0.95, rp.y - Math.sin(th) * 0.95, 0.72);
        look = e2t(rp.x + Math.cos(th) * 0.7, rp.y + Math.sin(th) * 0.7, 0.12);
        fov = 62;
        break;
      default:
        pos = e2t(-(S / 2 + 1.7), 0, 2.3);
        look = e2t(0.2, 0, 0);
        fov = 48;
    }
    if (this.persp.fov !== fov) {
      this.persp.fov = fov;
      this.persp.updateProjectionMatrix();
    }
    const k = this.camInit ? 1 - Math.exp(-dt * (this.mode === 'chase' ? 7 : 9)) : 1;
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
    const t0 = performance.now();
    const cam = this.updateCamera(focus, dt);
    this.renderer.render(this.scene, cam);
    this.lastDraw = performance.now() - t0;
  }

  // -------------------------------------------------------------------------------------------
  // Builder turntable (same scene graph code, same context)
  // -------------------------------------------------------------------------------------------

  private clearPreview(): void {
    this.highlightPart(null);
    if (this.previewGroup) this.root.remove(this.previewGroup);
    this.previewRobot?.dispose();
    this.previewGroup = null;
    this.previewRobot = null;
  }

  showPreview(spec: RobotSpec, envelope: { footprint: number; height: number | null }, alliance: Alliance | null = null): void {
    this.clearPreview();
    if (this.fieldGroup) this.fieldGroup.visible = false;
    for (const m of this.objMeshes) m.visible = false;
    for (const r of this.robotMeshes) r.group.visible = false;
    for (const d of this.detents) d.visible = false;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), new THREE.MeshStandardMaterial({ color: COLORS.tile, roughness: 0.95 }));
    pad.receiveShadow = true;
    g.add(pad);
    const grid = new THREE.GridHelper(1.5, 6, 0x4a505a, 0x363b44);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.001;
    g.add(grid);
    const robot = new RobotMesh(spec, alliance);
    shadowAll(robot.group, true, true);
    g.add(robot.group);
    // Expansion envelope (footprint × height) and the 18" starting cube.
    const H = inToM(envelope.height ?? 60);
    const F = inToM(envelope.footprint);
    const env = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(F, F, H)),
      new THREE.LineBasicMaterial({ color: 0x9aa3ad, transparent: true, opacity: envelope.height === null ? 0.25 : 0.5 }),
    );
    env.position.z = H / 2;
    g.add(env);
    const start = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(inToM(18), inToM(18), inToM(18))),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }),
    );
    start.position.z = inToM(9);
    g.add(start);
    this.previewGroup = g;
    this.previewRobot = robot;
    this.root.add(g);
    this.flat = false;
    this.applyFlat();
    this.resize();
  }

  setPreview2d(on: boolean): void {
    this.preview2d = on;
  }

  /** Preview lift/wrist pose so the builder can show the robot raised. */
  previewPose(lift: number, wrist: number): void {
    this.previewRobot?.update(lift, wrist);
  }

  renderPreview(dt: number): void {
    if (!this.previewGroup) return;
    if (this.preview2d) {
      this.previewRobot!.group.rotation.z = Math.PI / 2;
      this.ortho.position.copy(e2t(0, 0, 3));
      this.ortho.up.copy(e2t(0, 1, 0));
      this.ortho.lookAt(e2t(0, 0, 0));
      this.renderer.render(this.scene, this.ortho);
      return;
    }
    this.previewAngle += dt * 0.6;
    this.previewRobot!.group.rotation.z = this.previewAngle;
    if (this.persp.fov !== 40) {
      this.persp.fov = 40;
      this.persp.updateProjectionMatrix();
    }
    this.persp.up.set(0, 1, 0);
    this.persp.position.copy(e2t(1.15, -0.85, 0.85));
    this.persp.lookAt(e2t(0, 0, 0.18));
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
    return c.toDataURL('image/jpeg', 0.82);
  }

  endPreview(): void {
    this.clearPreview();
    if (this.fieldGroup) this.fieldGroup.visible = true;
    for (const r of this.robotMeshes) r.group.visible = true;
    for (const d of this.detents) d.visible = true;
    this.applyFlat();
    this.resize();
  }

  // -------------------------------------------------------------------------------------------
  // Palette (UI tokens), ambient menu backdrop, builder part highlight, 2D label projection
  // -------------------------------------------------------------------------------------------

  /** Take alliance / yellow / background / accent colors from the UI tokens. Applies to meshes built afterwards. */
  setPalette(p: { red: number; blue: number; yellow: number; bg: number; accent: number; ok: number; warn: number }): void {
    COLORS.red = p.red;
    COLORS.blue = p.blue;
    COLORS.yellow = p.yellow;
    COLORS.bg = p.bg;
    this.highlightColor = p.accent;
    this.okColor = p.ok;
    this.warnColor = p.warn;
    (this.grabRing.material as THREE.MeshBasicMaterial).color.setHex(p.accent);
    this.scene.background = new THREE.Color(p.bg);
    if (this.scene.fog) this.scene.fog = new THREE.Fog(p.bg, 9, 26);
  }

  /** Prepare the slowly orbiting field view used behind the menus. */
  beginAmbient(): void {
    this.mode = 'audience';
    if (this.orbit) this.orbit.enabled = false;
    if (this.flat) {
      this.flat = false;
      this.applyFlat();
    }
    this.camInit = false;
  }

  /** Render one ambient frame; `dt` = 0 renders a still frame (reduced motion). */
  renderAmbient(dt: number): void {
    const t0 = performance.now();
    this.ambientAngle += dt * 0.045;
    const S = this.fieldSize;
    const a = this.ambientAngle;
    if (this.persp.fov !== 42) {
      this.persp.fov = 42;
      this.persp.updateProjectionMatrix();
    }
    this.persp.up.set(0, 1, 0);
    this.persp.position.copy(e2t(Math.cos(a) * S * 1.02, Math.sin(a) * S * 1.02, S * 0.62));
    this.persp.lookAt(e2t(0, 0, -0.15));
    this.renderer.render(this.scene, this.persp);
    this.lastDraw = performance.now() - t0;
  }

  /** Outline one part of the builder preview robot (null clears). */
  highlightPart(part: string | null): void {
    if (this.highlight) {
      this.highlight.parent?.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as THREE.Material).dispose();
      this.highlight = null;
    }
    const robot = this.previewRobot;
    if (!part || !robot) return;
    const box = robot.partBox(part);
    if (!box) return;
    const h = new THREE.Box3Helper(box, new THREE.Color(this.highlightColor));
    const m = h.material as THREE.LineBasicMaterial;
    m.depthTest = false;
    m.transparent = true;
    h.renderOrder = 20;
    robot.group.add(h);
    this.highlight = h;
  }

  /** Canvas-pixel position of a field point (inches, engine frame) under the current camera. */
  project(xIn: number, yIn: number, zIn = 0): { x: number; y: number } | null {
    const cam = this.mode === 'overhead' ? this.ortho : this.persp;
    const v = new THREE.Vector3(inToM(xIn), inToM(yIn), inToM(zIn));
    this.root.localToWorld(v);
    v.project(cam);
    if (v.z > 1) return null;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  dispose(): void {
    this.clearPreview();
    this.clearWorld();
    this.orbit?.dispose();
    this.renderer.dispose();
  }
}
