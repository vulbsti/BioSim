/**
 * Gate A5: anatomy sits inside the body.
 * Loads the same merged atlas the app shows, then tests every vertex of the chosen parts
 * against closed container meshes (default: the skin) and, optionally, against meshes it must stay clear of (for
 * example bone). A vertex counts as inside a mesh when rays along all three axes agree it is (odd crossings),
 * so small holes in a source mesh cannot flip the answer.
 *
 * CLI:  npx tsx verify/containment.ts --parts "nerve|cord" [--inside Skin] [--clear-of system:skeletal] [--except "subscapularis"] [--allow 0.002]
 * `--except` drops obstacles by name: the atlas files a few muscles (tibialis anterior, subscapularis...) under skeletal.
 * Selectors match a part's name or id (case-insensitive regex), or `system:<id>`.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {combineAtlases,applyReplacements} from '../app/atlas-loader';
import type {Atlas,Part} from '../app/anatomy';
import {OUT} from './report-data';

const MODELS = new URL('../public/models/', import.meta.url);
type Mesh = {name: string; positions: Float32Array; indices: Uint32Array};

export function loadAtlas(): Atlas {
  const read = (f: string) => JSON.parse(readFileSync(new URL(f, MODELS), 'utf8')) as Atlas;
  const [base, addition, lungs, reconstructed, calibrated, registered, conduction, nerves] = ['atlas', 'expansion', 'lung-surfaces', 'reconstructed-vessels', 'calibrated-vessels', 'registered-vessels', 'heart-conduction', 'nerves'].map((f) => read(`${f}.json`));
  return combineAtlases(combineAtlases(applyReplacements(applyReplacements(combineAtlases(combineAtlases(combineAtlases(base, addition), lungs), reconstructed), calibrated), registered), conduction), nerves);
}

const chunks = new Map<string, ArrayBuffer>();
export function mesh(atlas: Atlas, p: Part): Mesh {
  const url = atlas.chunks[p.chunk].url.replace(/^\/models\//, '');
  if (!chunks.has(url)) {const b = readFileSync(new URL(url, MODELS)); chunks.set(url, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));}
  const buf = chunks.get(url)!;
  return {name: p.name, positions: new Float32Array(buf, p.positions, p.vertexCount * 3), indices: new Uint32Array(buf, p.indices, p.indexCount)};
}

export function select(atlas: Atlas, selector: string): Part[] {
  if (selector.startsWith('system:')) return atlas.parts.filter((p) => p.system === selector.slice(7));
  const re = new RegExp(selector, 'i');
  return atlas.parts.filter((p) => re.test(p.name) || re.test(p.id));
}

/** Triangles bucketed on a grid perpendicular to one axis, so a ray along that axis only tests its own cell. */
class AxisGrid {
  private cells = new Map<number, number[]>();
  private lo: [number, number];
  constructor(private tris: Float32Array, private axis: 0 | 1 | 2, private cell: number) {
    const [u, v] = this.plane(), n = tris.length / 9;
    let lu = Infinity, lv = Infinity;
    for (let i = 0; i < n * 3; i++) {lu = Math.min(lu, tris[i * 3 + u]); lv = Math.min(lv, tris[i * 3 + v]);}
    this.lo = [lu, lv];
    for (let t = 0; t < n; t++) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let k = 0; k < 3; k++) {const o = t * 9 + k * 3; u0 = Math.min(u0, tris[o + u]); u1 = Math.max(u1, tris[o + u]); v0 = Math.min(v0, tris[o + v]); v1 = Math.max(v1, tris[o + v]);}
      for (let a = this.key(u0, 0); a <= this.key(u1, 0); a++) for (let b = this.key(v0, 1); b <= this.key(v1, 1); b++) {
        const id = a * 100003 + b;
        (this.cells.get(id) ?? this.cells.set(id, []).get(id)!).push(t);
      }
    }
  }
  private plane(): [number, number] {return this.axis === 0 ? [1, 2] : this.axis === 1 ? [0, 2] : [0, 1];}
  private key(x: number, i: 0 | 1) {return Math.floor((x - this.lo[i]) / this.cell);}
  /** Number of triangle crossings of the ray from p towards +axis. */
  crossings(p: ArrayLike<number>): number {
    const [u, v] = this.plane(), w = this.axis, list = this.cells.get(this.key(p[u], 0) * 100003 + this.key(p[v], 1));
    if (!list) return 0;
    let count = 0;
    for (const t of list) {
      const o = t * 9, au = this.tris[o + u] - p[u], av = this.tris[o + v] - p[v], bu = this.tris[o + 3 + u] - p[u], bv = this.tris[o + 3 + v] - p[v], cu = this.tris[o + 6 + u] - p[u], cv = this.tris[o + 6 + v] - p[v];
      // Barycentric test of the point's projection inside the triangle's projection.
      const d1 = au * bv - av * bu, d2 = bu * cv - bv * cu, d3 = cu * av - cv * au;
      if (!((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0))) continue;
      const s = d1 + d2 + d3, depth = (d2 * this.tris[o + w] + d3 * this.tris[o + 3 + w] + d1 * this.tris[o + 6 + w]) / s;
      if (depth > p[w]) count++;
    }
    return count;
  }
}

/**
 * Triangles of a mesh's outer surface only. Some source meshes are shells with an inner and an outer surface
 * (the skin is): a connected piece whose box lies inside another piece's box is an inner layer and is dropped.
 */
export function outerTriangles(m: Mesh): number[] {
  const parent = Array.from({length: m.positions.length / 3}, (_, i) => i), root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x])));
  for (let i = 0; i < m.indices.length; i += 3) {parent[root(m.indices[i + 1])] = root(m.indices[i]); parent[root(m.indices[i + 2])] = root(m.indices[i]);}
  const box = new Map<number, number[]>();
  for (let v = 0; v < parent.length; v++) {
    const b = box.get(root(v)) ?? box.set(root(v), [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]).get(root(v))!;
    for (let k = 0; k < 3; k++) {b[k] = Math.min(b[k], m.positions[v * 3 + k]); b[k + 3] = Math.max(b[k + 3], m.positions[v * 3 + k]);}
  }
  const within = (a: number[], b: number[]) => a !== b && [0, 1, 2].every((k) => a[k] >= b[k] && a[k + 3] <= b[k + 3]);
  const keep = new Set([...box].filter(([, b]) => ![...box.values()].some((o) => within(b, o))).map(([r]) => r));
  const out: number[] = [];
  for (let i = 0; i < m.indices.length; i += 3) if (keep.has(root(m.indices[i]))) out.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  return out;
}

/** A closed surface (made of one or more meshes) that can say whether a point is inside it. */
export class Solid {
  private grids: AxisGrid[];
  constructor(meshes: Mesh[], cell = 0.01) {
    const outer = meshes.map(outerTriangles), n = outer.reduce((a, t) => a + t.length, 0), tris = new Float32Array(n * 3);
    let o = 0;
    meshes.forEach((m, j) => {for (const i of outer[j]) {tris[o++] = m.positions[i * 3]; tris[o++] = m.positions[i * 3 + 1]; tris[o++] = m.positions[i * 3 + 2];}});
    this.grids = ([0, 1, 2] as const).map((a) => new AxisGrid(tris, a, cell));
  }
  /** Inside when at least two of the three axis rays cross an odd number of times. */
  contains(p: ArrayLike<number>) {return this.grids.filter((g) => g.crossings(p) % 2 === 1).length >= 2;}
}

export type ContainmentResult = {
  parts: string; inside: string; clearOf?: string; except?: string; allow: number; pass: boolean;
  checked: number;
  rows: {name: string; vertices: number; outside: number; touching: number; worst?: number[]}[];
};

export function checkContainment(atlas: Atlas, {parts, inside = '^Skin$', clearOf, except, allow = 0}: {parts: string; inside?: string; clearOf?: string; except?: string; allow?: number}): ContainmentResult {
  const container = new Solid(select(atlas, inside).map((p) => mesh(atlas, p)));
  // Obstacles are tested one mesh at a time: bones overlap (a disc pressed into a vertebra), and one
  // parity count across overlapping meshes reports points in the gaps between them as inside.
  const obstacles = clearOf ? select(atlas, clearOf).filter((p) => !except || !new RegExp(except, 'i').test(p.name)).map((p) => ({box: p.bounds, solid: new Solid([mesh(atlas, p)])})) : [];
  const obstacle = clearOf ? {contains: (v: ArrayLike<number>) => obstacles.some(({box, solid}) => [0, 1, 2].every((k) => v[k] >= box[0][k] && v[k] <= box[1][k]) && solid.contains(v))} : null;
  const rows = select(atlas, parts).map((p) => {
    const m = mesh(atlas, p);
    let outside = 0, touching = 0, worst: number[] | undefined;
    for (let i = 0; i < m.positions.length; i += 3) {
      const v = m.positions.subarray(i, i + 3);
      if (!container.contains(v)) {outside++; worst ??= [...v];}
      else if (obstacle?.contains(v)) touching++;
    }
    return {name: p.name, vertices: m.positions.length / 3, outside, touching, worst};
  });
  const checked = rows.reduce((a, r) => a + r.vertices, 0), bad = rows.reduce((a, r) => a + r.outside + r.touching, 0);
  return {parts, inside, clearOf, except, allow, checked, pass: rows.length > 0 && bad <= allow * checked, rows};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k: string) => {const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined;};
  const parts = arg('--parts') ?? 'system:nervous';
  const r = checkContainment(loadAtlas(), {parts, inside: arg('--inside'), clearOf: arg('--clear-of'), except: arg('--except'), allow: Number(arg('--allow') ?? 0)});
  mkdirSync(OUT, {recursive: true});
  writeFileSync(`${OUT}/containment-${parts.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(r, null, 1));
  for (const row of r.rows.filter((x) => x.outside || x.touching)) console.log(`${row.name}: ${row.outside} of ${row.vertices} outside${row.touching ? `, ${row.touching} inside ${r.clearOf}` : ''}`);
  console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.rows.length} parts, ${r.checked} vertices checked against ${r.inside}${r.clearOf ? `, clear of ${r.clearOf}` : ''}`);
  process.exitCode = r.pass ? 0 : 1;
}
