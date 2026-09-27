import { AUTON_LINE_Y, FIELD_HALF, MIDFIELD, STARTING_TILES, TILE_SIZE } from '../sim/fieldConfig';
import { wrapAngle } from '../sim/geometry';
import { findScoringGoal, releasePoint, stackHeight, toggleZone, yellowOwner } from '../sim/sim';
import type { Alliance, PinColor, SimState } from '../sim/types';

const C = {
  bg: '#121418',
  tileA: '#3a3f47',
  tileB: '#353941',
  seam: 'rgba(0,0,0,0.35)',
  tape: 'rgba(255,255,255,0.8)',
  wall: '#a3acb7',
  red: '#e5484d',
  blue: '#3e7bfa',
  redDark: '#7d1a1f',
  blueDark: '#1b3a86',
  pin: '#f5c542',
  pinDark: '#7a5c0c',
  cup: '#c9ced6',
  cupDark: '#6b727d',
  goalBase: '#202328',
  neutral: '#7d8590',
  toggleOff: '#59606b',
  intake: '#6b7280',
  wheel: '#0c0d0f',
};

const allianceColor = (a: Alliance | null): string => (a === 'red' ? C.red : a === 'blue' ? C.blue : C.neutral);
const allianceDark = (a: Alliance): string => (a === 'red' ? C.redDark : C.blueDark);
const pinColor = (c: PinColor | null): string => (c === 'yellow' || c === null ? C.pin : allianceColor(c));
const pinDark = (c: PinColor | null): string => (c === 'yellow' || c === null ? C.pinDark : allianceDark(c));
const pieceColor = (p: { kind: string; color: PinColor | null }): string => (p.kind === 'cup' ? C.cup : pinColor(p.color));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Poses from the tick before the latest one, for render interpolation. */
export class PoseBuffer {
  robots: number[] = [];
  pieces: number[] = [];
  floor: boolean[] = [];
  valid = false;

  capture(s: SimState): void {
    const rb = this.robots;
    rb.length = s.robots.length * 3;
    for (let i = 0; i < s.robots.length; i++) {
      const r = s.robots[i];
      rb[i * 3] = r.x;
      rb[i * 3 + 1] = r.y;
      rb[i * 3 + 2] = r.theta;
    }
    const pb = this.pieces;
    pb.length = s.pieces.length * 2;
    this.floor.length = s.pieces.length;
    for (let i = 0; i < s.pieces.length; i++) {
      const p = s.pieces[i];
      pb[i * 2] = p.x;
      pb[i * 2 + 1] = p.y;
      this.floor[i] = p.state === 'floor';
    }
    this.valid = true;
  }
}

/**
 * Top-down Canvas 2D renderer. Draws in field inches through a view transform that puts
 * the viewer's own driver wall at the bottom of the screen (red: 180° rotated from blue).
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private k = 1;
  private cx = 0;
  private cy = 0;
  private flip = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
  }

  private toScreen(x: number, y: number): [number, number] {
    return [this.cx + this.flip * this.k * x, this.cy - this.flip * this.k * y];
  }

  draw(s: SimState, prev: PoseBuffer, alpha: number, view: Alliance, showZones: boolean): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const top = 72 * this.dpr;
    const bottom = 44 * this.dpr;
    const avail = Math.max(50, Math.min(W - 24 * this.dpr, H - top - bottom));
    this.k = avail / (2 * FIELD_HALF + 14);
    this.cx = W / 2;
    this.cy = top + (H - top - bottom) / 2;
    this.flip = view === 'red' ? -1 : 1;
    ctx.setTransform(this.flip * this.k, 0, 0, -this.flip * this.k, this.cx, this.cy);

    this.drawField(s);
    this.drawGoals(s);
    this.drawPieces(s, prev, alpha);
    this.drawRobots(s, prev, alpha, showZones);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLabels(s, view);
  }

  private circle(x: number, y: number, r: number, fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private drawField(s: SimState): void {
    const { ctx } = this;
    const H = FIELD_HALF;
    const n = Math.round((2 * H) / TILE_SIZE);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? C.tileA : C.tileB;
        ctx.fillRect(-H + i * TILE_SIZE, -H + j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    ctx.strokeStyle = C.seam;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const v = -H + i * TILE_SIZE;
      ctx.moveTo(v, -H);
      ctx.lineTo(v, H);
      ctx.moveTo(-H, v);
      ctx.lineTo(H, v);
    }
    ctx.stroke();

    // starting tiles
    ctx.lineWidth = 0.8;
    for (const al of ['red', 'blue'] as const) {
      for (const side of ['left', 'right'] as const) {
        const t = STARTING_TILES[al][side];
        ctx.strokeStyle = allianceColor(al);
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(t.x - TILE_SIZE / 2 + 0.6, t.y - TILE_SIZE / 2 + 0.6, TILE_SIZE - 1.2, TILE_SIZE - 1.2);
      }
    }
    ctx.globalAlpha = 1;

    // quadrant diagonals, midfield diamond, auton line
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-H, -H);
    ctx.lineTo(H, H);
    ctx.moveTo(-H, H);
    ctx.lineTo(H, -H);
    ctx.stroke();
    const m = MIDFIELD.halfDiagonal;
    ctx.strokeStyle = C.tape;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, m);
    ctx.lineTo(m, 0);
    ctx.lineTo(0, -m);
    ctx.lineTo(-m, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([3, 2.5]);
    ctx.beginPath();
    ctx.moveTo(-H, AUTON_LINE_Y);
    ctx.lineTo(H, AUTON_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // perimeter + driver walls
    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-H - 1.25, -H - 1.25, 2 * H + 2.5, 2 * H + 2.5);
    ctx.fillStyle = C.red;
    ctx.fillRect(-H, H + 3, 2 * H, 2.5);
    ctx.fillStyle = C.blue;
    ctx.fillRect(-H, -H - 5.5, 2 * H, 2.5);

    // toggles
    for (const t of s.toggles) {
      const z = toggleZone(t);
      ctx.fillStyle = t.owner ? allianceColor(t.owner) : C.toggleOff;
      ctx.fillRect(z.x - z.hx, z.y - z.hy, z.hx * 2, z.hy * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.4;
      ctx.strokeRect(z.x - z.hx, z.y - z.hy, z.hx * 2, z.hy * 2);
    }
  }

  private drawGoals(s: SimState): void {
    const { ctx } = this;
    for (const g of s.goals) {
      // ring = alliance goal color; neutral goals show who their yellow Pins score for
      const owner = g.alliance ?? yellowOwner(s, g);
      this.circle(g.x, g.y, g.r + 1.3, allianceColor(owner));
      this.circle(g.x, g.y, g.r, C.goalBase);
      if (g.kind === 'tall') {
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + 2.4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
      if (g.stack.length > 0) {
        const p = s.pieces[g.stack[g.stack.length - 1]];
        this.circle(g.x, g.y, g.r * 0.62, pieceColor(p));
      }
    }
  }

  private drawPieces(s: SimState, prev: PoseBuffer, a: number): void {
    const usePrev = prev.valid && prev.floor.length === s.pieces.length;
    for (let i = 0; i < s.pieces.length; i++) {
      const p = s.pieces[i];
      if (p.state !== 'floor') continue;
      let x = p.x;
      let y = p.y;
      if (usePrev && prev.floor[i]) {
        x = lerp(prev.pieces[i * 2], x, a);
        y = lerp(prev.pieces[i * 2 + 1], y, a);
      }
      if (p.kind === 'cup') {
        this.circle(x, y, p.r, C.cup);
        this.circle(x, y, p.r * 0.55, C.cupDark);
      } else {
        this.circle(x, y, p.r, pinColor(p.color));
        this.circle(x, y, p.r * 0.4, pinDark(p.color));
      }
    }
  }

  private drawRobots(s: SimState, prev: PoseBuffer, a: number, showZones: boolean): void {
    const { ctx } = this;
    const usePrev = prev.valid && prev.robots.length === s.robots.length * 3;
    s.robots.forEach((r, i) => {
      let x = r.x;
      let y = r.y;
      let th = r.theta;
      if (usePrev) {
        const pth = prev.robots[i * 3 + 2];
        x = lerp(prev.robots[i * 3], x, a);
        y = lerp(prev.robots[i * 3 + 1], y, a);
        th = pth + wrapAngle(th - pth) * a;
      }
      const d = r.derived;
      const c = r.config;

      if (r.alignTarget !== null) {
        const g = s.goals[r.alignTarget];
        ctx.setLineDash([1.5, 1.5]);
        ctx.strokeStyle = 'rgba(140,255,180,0.7)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(th);
      if (showZones) {
        const z = d.intakeZone;
        ctx.fillStyle = r.intaking ? 'rgba(120,255,160,0.35)' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(z.cx - z.hx, z.cy - z.hy, z.hx * 2, z.hy * 2);
        ctx.setLineDash([0.8, 0.8]);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(z.cx - z.hx, z.cy - z.hy, z.hx * 2, z.hy * 2);
        ctx.setLineDash([]);
      }
      for (let k = 1; k < d.shapes.length; k++) {
        const b = d.shapes[k];
        ctx.fillStyle = C.intake;
        ctx.fillRect(b.cx - b.hx, b.cy - b.hy, b.hx * 2, b.hy * 2);
        ctx.strokeStyle = '#2b2f36';
        ctx.lineWidth = 0.4;
        for (let rx = b.cx - b.hx + 1; rx < b.cx + b.hx; rx += 1.6) {
          ctx.beginPath();
          ctx.moveTo(rx, b.cy - b.hy);
          ctx.lineTo(rx, b.cy + b.hy);
          ctx.stroke();
        }
      }
      const body = d.shapes[0];
      ctx.fillStyle = allianceDark(r.alliance);
      ctx.fillRect(-body.hx, -body.hy, body.hx * 2, body.hy * 2);
      ctx.strokeStyle = allianceColor(r.alliance);
      ctx.lineWidth = 0.9;
      ctx.strokeRect(-body.hx + 0.45, -body.hy + 0.45, body.hx * 2 - 0.9, body.hy * 2 - 0.9);
      for (const w of d.wheels) {
        ctx.save();
        ctx.translate(w.px, w.py);
        ctx.rotate(Math.atan2(w.dy, w.dx));
        ctx.fillStyle = C.wheel;
        const len = c.drivetrain === 'tank' ? c.length - 2 : c.wheelDiameter;
        ctx.fillRect(-len / 2, -0.9, len, 1.8);
        ctx.restore();
      }
      // front arrow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(body.hx - 1.2, 0);
      ctx.lineTo(body.hx - 4.5, 2.4);
      ctx.lineTo(body.hx - 4.5, -2.4);
      ctx.closePath();
      ctx.fill();
      // held pieces
      r.held.forEach((pid, k) => {
        const p = s.pieces[pid];
        const px = 1.5 - k * 4.4;
        this.circle(px, 0, p.r * 0.85, pieceColor(p));
      });
      ctx.restore();

      if (showZones && r.held.length > 0) {
        const rp = releasePoint(r);
        const goal = findScoringGoal(s, r);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = goal ? '#6dffa0' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = goal ? 0.7 : 0.35;
        ctx.stroke();
      }
    });
  }

  private drawLabels(s: SimState, view: Alliance): void {
    const { ctx } = this;
    const px = Math.max(10, this.k * 2.4);
    ctx.font = `600 ${px}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of s.goals) {
      // put the count label on the far side of the goal from the viewer
      const [sx, sy] = this.toScreen(g.x, g.y);
      const off = (g.r + 3.6) * this.k;
      const text = `${stackHeight(s, g).toFixed(1)}/${g.height}"`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(text).width + px * 0.6;
      ctx.fillRect(sx - w / 2, sy - off - px * 0.65, w, px * 1.3);
      ctx.fillStyle = '#e8ecf1';
      ctx.fillText(text, sx, sy - off);
    }
    // driver-station caption
    ctx.font = `600 ${Math.max(11, this.k * 3)}px system-ui, sans-serif`;
    ctx.fillStyle = allianceColor(view);
    const [bx, by] = this.toScreen(0, view === 'red' ? FIELD_HALF + 10 : -FIELD_HALF - 10);
    ctx.fillText(`${view.toUpperCase()} DRIVER STATION`, bx, Math.min(by, this.canvas.height - 12 * this.dpr));
  }
}
