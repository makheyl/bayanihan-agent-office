import type { Block, XZ } from './layout';

/**
 * Walking paths through the office, in place of the Unity HQ's baked NavMesh: a 0.2 m grid over the floor with the
 * furniture blocked out (padded by a body's width), A* across it, then the path pulled straight wherever there is a clear
 * line, so people walk in natural lines around desks instead of zig-zagging.
 */
export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly blocked: Uint8Array;

  constructor(opts: { minX: number; maxX: number; minZ: number; maxZ: number; cell?: number; blocks: Block[]; pad?: number }) {
    this.cell = opts.cell ?? 0.2;
    this.minX = opts.minX;
    this.minZ = opts.minZ;
    this.cols = Math.ceil((opts.maxX - opts.minX) / this.cell);
    this.rows = Math.ceil((opts.maxZ - opts.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    const pad = opts.pad ?? 0.3;
    for (const b of opts.blocks) {
      const [c0, r0] = this.toCell(b.x - b.hx - pad, b.z - b.hz - pad);
      const [c1, r1] = this.toCell(b.x + b.hx + pad, b.z + b.hz + pad);
      for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++)
        for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) this.blocked[r * this.cols + c] = 1;
    }
  }

  isFree(x: number, z: number): boolean {
    const [c, r] = this.toCell(x, z);
    return this.inside(c, r) && !this.blocked[r * this.cols + c];
  }

  /**
   * A walkable path from `from` to `to`, including both ends. Ends inside furniture (a chair, a desk's edge) are joined
   * through the nearest free cell. Returns a straight line if no route exists, so nobody is ever stuck.
   */
  path(from: XZ, to: XZ): XZ[] {
    const start = this.nearestFree(from);
    const goal = this.nearestFree(to);
    if (!start || !goal) return [from, to];
    const cells = this.astar(start, goal);
    if (!cells) return [from, to];
    const pts: XZ[] = [from, ...cells.map(([c, r]) => this.centre(c, r)), to];
    return this.smooth(pts);
  }

  private astar(start: [number, number], goal: [number, number]): [number, number][] | null {
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open = new MinHeap();
    const s = start[1] * this.cols + start[0];
    const t = goal[1] * this.cols + goal[0];
    g[s] = 0;
    open.push(s, this.h(s, t));
    const SQ2 = Math.SQRT2;
    while (open.size) {
      const cur = open.pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur - cc) / this.cols;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!this.inside(nc, nr)) continue;
          const ni = nr * this.cols + nc;
          if (this.blocked[ni] || closed[ni]) continue;
          // No cutting corners past furniture.
          if (dr && dc && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
          const cost = g[cur] + (dr && dc ? SQ2 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            open.push(ni, cost + this.h(ni, t));
          }
        }
    }
    if (s !== t && came[t] < 0) return null;
    const out: [number, number][] = [];
    for (let i = t; i >= 0; i = i === s ? -1 : came[i]) out.push([i % this.cols, Math.floor(i / this.cols)]);
    return out.reverse();
  }

  private h(a: number, b: number): number {
    const dc = Math.abs((a % this.cols) - (b % this.cols));
    const dr = Math.abs(Math.floor(a / this.cols) - Math.floor(b / this.cols));
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  }

  /** Drops every point that the walker could skip with a clear straight line. */
  private smooth(pts: XZ[]): XZ[] {
    if (pts.length <= 2) return pts;
    const out: XZ[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      // The two ends may sit inside furniture (a chair), so only the inner points have to see each other.
      while (j > i + 1 && !this.clear(pts[i], pts[j], i === 0, j === pts.length - 1)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  private clear(a: XZ, b: XZ, aIsEnd: boolean, bIsEnd: boolean): boolean {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      if (this.isFree(x, z)) continue;
      // Leaving or reaching a chair: the stretch next to it may cross the padding.
      if ((aIsEnd && t * dist < 0.9) || (bIsEnd && (1 - t) * dist < 0.9)) continue;
      return false;
    }
    return true;
  }

  private nearestFree(p: XZ): [number, number] | null {
    const [c0, r0] = this.toCell(p[0], p[1]);
    for (let radius = 0; radius < 12; radius++)
      for (let dr = -radius; dr <= radius; dr++)
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (this.inside(c, r) && !this.blocked[r * this.cols + c]) return [c, r];
        }
    return null;
  }

  private toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  private centre(c: number, r: number): XZ {
    return [this.minX + (c + 0.5) * this.cell, this.minZ + (r + 0.5) * this.cell];
  }

  private inside(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }
}

/** A binary heap of cell indices by priority, for A*. */
class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
