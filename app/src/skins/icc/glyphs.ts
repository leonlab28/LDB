// ICC-Skin: Neon-Röhren-Ziffern (von Leon freigegeben am 23.11.2026, Entwurf in /icc/zeichen im Projekt).
// Jede Röhre ist eine Polylinie, deren Ecken als echte Kreisbögen gebogen sind, so wie Glas sich biegen lässt.
// Röhrendurchmesser 6,2 Einheiten, kleinster Biegeradius (Mittellinie) 6,5 Einheiten. Glyphenbox 60 x 100.

export const TUBE_D = 6.2;
const RMIN = 6.5;
const R = 16;
const END = 2.6; // gerades Stück am Röhrenende für die Rückbiegung in die Wand

type Pt = [number, number, number?];
export interface TubeEnd {
  x: number;
  y: number;
  /** Richtung (Grad), in der die Röhre das Zeichen verlässt und nach hinten wegbiegt. */
  ang: number;
}
export interface Tube {
  d: string;
  len: number;
  ends: [TubeEnd, TubeEnd];
}
export interface Glyph {
  w: number;
  tubes: Tube[];
  /** Schatten, den eine vorne liegende Röhre auf eine dahinterliegende wirft (Kreuzung in der 4). */
  front: string[];
}

const deg = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI;

function fillet(pts: Pt[]): Tube {
  const n = pts.length;
  const P = pts.map(([x, y, r]) => ({ x, y, r: r ?? 0 }));
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
  const C = P.map((B, i) => {
    if (i === 0 || i === n - 1) return null;
    const A = P[i - 1];
    const Cn = P[i + 1];
    const ux = (A.x - B.x) / seg(A, B);
    const uy = (A.y - B.y) / seg(A, B);
    const vx = (Cn.x - B.x) / seg(B, Cn);
    const vy = (Cn.y - B.y) / seg(B, Cn);
    const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    const r = Math.max(B.r || RMIN, RMIN);
    return { t: r / Math.tan(th / 2), th, ux, uy, vx, vy, cross: ux * vy - uy * vx, rr: r };
  });
  for (let i = 1; i < n - 1; i++) {
    const c = C[i]!;
    const prev = C[i - 1];
    const next = C[i + 1];
    const availA = seg(P[i - 1], P[i]) - (prev ? prev.t : END);
    const availC = seg(P[i], P[i + 1]) - (next ? next.t : END);
    c.t = Math.max(0, Math.min(availA, availC, c.t));
    c.rr = c.t * Math.tan(c.th / 2);
  }
  let d = `M ${P[0].x} ${P[0].y}`;
  let len = 0;
  let last = { x: P[0].x, y: P[0].y };
  let firstNext: { x: number; y: number } | null = null;
  for (let i = 1; i < n; i++) {
    const B = P[i];
    const c = C[i];
    if (!c) {
      len += seg(last, B);
      if (!firstNext) firstNext = B;
      d += ` L ${B.x} ${B.y}`;
      last = B;
      continue;
    }
    const p1 = { x: B.x + c.ux * c.t, y: B.y + c.uy * c.t };
    const p2 = { x: B.x + c.vx * c.t, y: B.y + c.vy * c.t };
    if (!firstNext) firstNext = p1;
    len += seg(last, p1) + c.rr * (Math.PI - c.th);
    d += ` L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${c.rr.toFixed(2)} ${c.rr.toFixed(2)} 0 0 ${c.cross > 0 ? 0 : 1} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    last = p2;
  }
  const a = P[0];
  const b = P[n - 1];
  const beforeB = C[n - 2] ? { x: P[n - 2].x + C[n - 2]!.vx * C[n - 2]!.t, y: P[n - 2].y + C[n - 2]!.vy * C[n - 2]!.t } : P[n - 2];
  return {
    d,
    len,
    ends: [
      { x: a.x, y: a.y, ang: deg(a.x - firstNext!.x, a.y - firstNext!.y) },
      { x: b.x, y: b.y, ang: deg(b.x - beforeB.x, b.y - beforeB.y) },
    ],
  };
}

/** Ring mit kleinstem Radius; beide Enden biegen unten nebeneinander in die Wand. */
function ring(cx: number, cy: number, r: number): Tube {
  const dx = 2.4;
  const h = Math.sqrt(r * r - dx * dx);
  const t1 = Math.atan2(h, -dx); // Startpunkt unten links, die Röhre läuft im Uhrzeigersinn
  const t2 = Math.atan2(h, dx); // Endpunkt unten rechts
  return {
    d: `M ${(cx - dx).toFixed(2)} ${(cy + h).toFixed(2)} A ${r} ${r} 0 0 1 ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${(cx + dx).toFixed(2)} ${(cy + h).toFixed(2)}`,
    len: r * (2 * Math.PI - (t1 - t2)),
    ends: [
      { x: cx - dx, y: cy + h, ang: deg(Math.sin(t1), -Math.cos(t1)) },
      { x: cx + dx, y: cy + h, ang: deg(-Math.sin(t2), Math.cos(t2)) },
    ],
  };
}

const T = (...tubes: Pt[][]) => tubes.map(fillet);

export const GLYPHS: Record<string, Glyph> = {
  '0': { w: 60, front: [], tubes: T([[28, 7], [6, 7, R], [6, 93, R], [54, 93, R], [54, 7, R], [33, 7]]) },
  '1': { w: 60, front: [], tubes: T([[12, 17], [34, 3, 7], [34, 93]]) },
  '2': { w: 60, front: [], tubes: T([[6, 24], [6, 7, R], [54, 7, R], [54, 40, R], [6, 93, 8], [55, 93]]) },
  // 3: zwei Bäuche aus zwei Röhren (eine 180°-Wende in der Mitte ginge in Glas nicht)
  '3': { w: 60, front: [], tubes: T([[8, 22], [8, 7, 14], [50, 7, 14], [50, 44, 14], [24, 44]], [[24, 51], [54, 51, R], [54, 93, R], [6, 93, R], [6, 78]]) },
  '4': { w: 60, front: ['M 42 58.6 V 60.9', 'M 42 67.1 V 69.4'], tubes: T([[42, 93], [42, -5, 7], [6, 64, 7], [56, 64]]) },
  '5': { w: 60, front: [], tubes: T([[54, 7], [9, 7, 7], [8, 42, 7], [54, 42, R], [54, 93, R], [6, 93, R], [6, 78]]) },
  '6': { w: 60, front: [], tubes: T([[50, 7], [6, 7, R], [6, 93, R], [54, 93, R], [54, 47, R], [13, 47]]) },
  '7': { w: 60, front: [], tubes: T([[6, 7], [54, 7, 7], [24, 93]]) },
  '8': { w: 60, front: [], tubes: T([[27, 7], [10, 7, 14], [10, 44, 14], [50, 44, 14], [50, 7, 14], [33, 7]], [[27, 93], [6, 93, R], [6, 51, R], [54, 51, R], [54, 93, R], [33, 93]]) },
  '9': { w: 60, front: [], tubes: T([[10, 93], [54, 93, R], [54, 7, R], [6, 7, R], [6, 53, R], [47, 53]]) },
  ':': { w: 30, front: [], tubes: [ring(15, 32.5, 6.5), ring(15, 67.5, 6.5)] },
  '°': { w: 26, front: [], tubes: [ring(13, 15.5, 6.5)] },
  '-': { w: 36, front: [], tubes: T([[5, 50], [31, 50]]) },
};

export function neonWidth(text: string, gap = 10): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.w ?? 40) + gap;
  return w - gap;
}
