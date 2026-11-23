import { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { GLYPHS, neonWidth, TUBE_D, type Tube } from './glyphs';

export const NEON = {
  red: { tube: '#ff2d14', mid: '#ff5a2a', core: '#ffe2c4', halo: '#ff1e08' },
  cyan: { tube: '#0fb4ff', mid: '#3fd0ff', core: '#dcfaff', halo: '#0896ff' },
  green: { tube: '#2dff7a', mid: '#6dffa0', core: '#eafff0', halo: '#10e060' },
} as const;
export type NeonColor = keyof typeof NEON;

const GAP = 12;
const PAD = 16; // Platz für den Lichthof rund um die Röhren (in Glyphen-Einheiten)
const SW = TUBE_D;

/**
 * Neon-Schrift aus echten Röhren. Statt eines Weichzeichners (Filter sind in React Native unzuverlässig)
 * wird der Lichthof aus mehreren breiten, sehr transparenten Strichen geschichtet. Darüber: Röhre,
 * heißer Kern, Glasreflex und an jedem Ende die Rückbiegung in die Wand (dunkler werdende Glaskuppe).
 */
export function NeonText({ text, height, color = 'red' }: { text: string; height: number; color?: NeonColor }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pal = NEON[color];
  const w = neonWidth(text, GAP);
  const vbW = w + PAD * 2;
  const vbH = 100 + PAD * 2;
  const scale = height / 100;
  const items: { x: number; tubes: Tube[]; front: string[] }[] = [];
  let x = PAD;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) items.push({ x, tubes: g.tubes, front: g.front });
    x += (g?.w ?? 40) + GAP;
  }
  const trim = (len: number, t: number) => ({ strokeDasharray: [len - 2 * t, len], strokeDashoffset: 2 * len - 3 * t });
  const halo = [
    [5.6, 0.035],
    [4.6, 0.045],
    [3.8, 0.06],
    [3.1, 0.08],
    [2.5, 0.11],
    [2.0, 0.15],
    [1.6, 0.22],
    [1.3, 0.32],
  ] as const;

  return (
    <Svg width={vbW * scale} height={vbH * scale} viewBox={`0 0 ${vbW} ${vbH}`} style={{ margin: -PAD * scale }}>
      <Defs>
        <LinearGradient id={`e${id}`} gradientUnits="userSpaceOnUse" x1={-6} y1={0} x2={3.1} y2={0}>
          <Stop offset={0} stopColor="#06070a" stopOpacity={0} />
          <Stop offset={0.45} stopColor="#06070a" stopOpacity={0.18} />
          <Stop offset={0.72} stopColor="#06070a" stopOpacity={0.55} />
          <Stop offset={0.88} stopColor="#06070a" stopOpacity={0.8} />
          <Stop offset={1} stopColor="#06070a" stopOpacity={0.92} />
        </LinearGradient>
      </Defs>
      {/* Lichthof */}
      {halo.map(([k, o], li) =>
        items.map((it, gi) =>
          it.tubes.map((t, ti) => (
            <Path
              key={`h${li}-${gi}-${ti}`}
              d={t.d}
              transform={`translate(${it.x} ${PAD})`}
              fill="none"
              stroke={li < 4 ? pal.halo : pal.mid}
              strokeOpacity={o}
              strokeWidth={SW * k}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...trim(t.len, 2)}
            />
          )),
        ),
      )}
      {items.map((it, gi) => (
        <G key={`g${gi}`} transform={`translate(${it.x} ${PAD})`}>
          {it.tubes.map((t, ti) => (
            <G key={ti}>
              <Path d={t.d} fill="none" stroke={pal.tube} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
              <Path d={t.d} fill="none" stroke={pal.core} strokeOpacity={0.55} strokeWidth={SW * 0.55} strokeLinecap="round" strokeLinejoin="round" {...trim(t.len, 2.4)} />
              <Path d={t.d} fill="none" stroke={pal.core} strokeOpacity={0.95} strokeWidth={SW * 0.28} strokeLinecap="round" strokeLinejoin="round" {...trim(t.len, 2.8)} />
              <Path d={t.d} transform="translate(-0.7 -0.7)" fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={SW * 0.1} strokeLinejoin="round" {...trim(t.len, 2.4)} />
              {t.ends.map((e, ei) => (
                <G key={ei} transform={`translate(${e.x} ${e.y}) rotate(${e.ang})`}>
                  <Path d="M -6 0 H 0" stroke={`url(#e${id})`} strokeWidth={SW * 1.02} strokeLinecap="round" fill="none" />
                  <Path
                    d={`M -0.4 ${-SW * 0.36} A ${SW * 0.4} ${SW * 0.4} 0 0 1 ${SW * 0.33} ${-SW * 0.05}`}
                    stroke="#ffffff"
                    strokeOpacity={0.22}
                    strokeWidth={0.45}
                    strokeLinecap="round"
                    fill="none"
                  />
                </G>
              ))}
            </G>
          ))}
          {it.front.map((d, fi) => (
            <Path key={`f${fi}`} d={d} fill="none" stroke="#05060a" strokeOpacity={0.5} strokeWidth={SW} />
          ))}
        </G>
      ))}
    </Svg>
  );
}

/** Breite (in Punkt) einer Neon-Zeile bei gegebener Ziffernhöhe, ohne den Lichthof. */
export const neonTextWidth = (text: string, height: number) => (neonWidth(text, GAP) * height) / 100;

/** Neon-Spirale wie die Leuchtschlaufen an der ICC-Decke, als Trenner. */
export function NeonCoil({ width, height = 30, color = 'red' }: { width: number; height?: number; color?: NeonColor }) {
  const pal = NEON[color];
  const r = height * 0.32;
  const k = r * 0.38;
  const x0 = r + 4;
  const n = (width - 2 * x0) / (2 * Math.PI * k);
  let d = '';
  for (let t = 0; t <= Math.PI * 2 * n; t += 0.12) {
    const px = x0 + t * k + r * Math.cos(t + Math.PI);
    const py = height / 2 + r * 0.55 * Math.sin(t + Math.PI);
    d += `${d ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  return (
    <Svg width={width} height={height}>
      <Path d={d} fill="none" stroke={pal.halo} strokeOpacity={0.12} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={pal.halo} strokeOpacity={0.25} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={pal.mid} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} fill="none" stroke={pal.core} strokeOpacity={0.8} strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
