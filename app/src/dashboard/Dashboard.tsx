import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GAP } from '../design/tokens';
import { ClockBanner } from './ClockBanner';
import { cityOf } from '../lib/time';
import { useIcc } from '../design/skin';
import { HEAD_H } from '../skins/icc/IccClockBanner';
import type { DashCtx } from './context';
import { CalendarTile, LightTile, MapTile, NotesTile, PhotosTile, VoiceTile } from './tiles';

type Box = { left: number; top: number; width: number; height: number };

/**
 * Rechnet das Raster aus der verfügbaren Fläche aus, damit immer alles ohne Scrollen sichtbar ist.
 * Hochformat: Uhr als Banner oben, darunter Fotos groß mit Sprache (quadratisch) und Ampel (schmal) daneben,
 * dann Post-its und Karte, unten der Kalender.
 * Querformat: Uhr links oben, darunter Sprache, Ampel und Kalender; rechts Fotos groß, darunter Post-its und Karte.
 */
function layout(W: number, H: number, extraTop = 0) {
  const g = GAP;
  if (W <= H * 1.1) {
    const clockH = Math.max(130, Math.min(H * 0.23, 240)) + extraTop;
    const rest = H - clockH - 3 * g;
    const rowC = Math.max(58, Math.min(rest * 0.13, 84)); // Kalender: schmale Leiste
    const rowA = (rest - rowC) * 0.53;
    const rowB = rest - rowC - rowA;
    const s = Math.min(W * 0.38, rowA - g - 60); // Sprache: quadratisch
    const photosW = W - g - s;
    const yA = clockH + g;
    const yB = yA + rowA + g;
    const yC = yB + rowB + g;
    const half = (W - g) / 2;
    return {
      clock: { left: 0, top: 0, width: W, height: clockH },
      photos: { left: 0, top: yA, width: photosW, height: rowA },
      voice: { left: photosW + g, top: yA, width: s, height: s },
      light: { left: photosW + g, top: yA + s + g, width: s, height: rowA - s - g },
      notes: { left: 0, top: yB, width: half, height: rowB },
      map: { left: half + g, top: yB, width: half, height: rowB },
      calendar: { left: 0, top: yC, width: W, height: rowC },
    } satisfies Record<string, Box>;
  }
  // Querformat
  const L = Math.max(260, Math.min(W * 0.42, 520));
  const clockH = H * 0.5;
  const lowH = H - clockH - g;
  const s = Math.min(lowH, L * 0.48);
  const colW = L - s - g;
  const lightH = Math.max(64, (lowH - g) * 0.5);
  const R = W - L - g;
  const photosH = (H - g) * 0.56;
  const lowR = H - photosH - g;
  const halfR = (R - g) / 2;
  return {
    clock: { left: 0, top: 0, width: L, height: clockH },
    voice: { left: 0, top: clockH + g, width: s, height: s },
    light: { left: s + g, top: clockH + g, width: colW, height: lightH },
    calendar: { left: s + g, top: clockH + g + lightH + g, width: colW, height: lowH - lightH - g },
    photos: { left: L + g, top: 0, width: R, height: photosH },
    notes: { left: L + g, top: photosH + g, width: halfR, height: lowR },
    map: { left: L + g + halfR + g, top: photosH + g, width: halfR, height: lowR },
  } satisfies Record<string, Box>;
}

export function Dashboard({ c, corner }: { c: DashCtx; corner: ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) setSize({ w: width, h: height });
  };

  const profile = c.view?.profile && c.view.profile !== 'locked' ? c.view.profile : null;
  const icc = useIcc();
  const name = profile?.name || (c.mode === 'me' ? 'Ich' : profile?.tz ? cityOf(profile.tz) : 'Partner');

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {size
        ? (() => {
            const b = layout(size.w, size.h, icc ? HEAD_H : 0);
            const at = (x: Box) => ({ position: 'absolute' as const, ...x });
            return (
              <>
                <View style={at(b.clock)}>
                  <ClockBanner
                    name={name}
                    tz={profile?.tz ?? (c.mode === 'me' ? c.myTz : null)}
                    myTz={c.myTz}
                    now={c.now}
                    width={b.clock.width}
                    height={b.clock.height}
                    showDifference={c.mode === 'partner' && !c.mirror}
                    corner={corner}
                  />
                </View>
                <PhotosTile c={c} style={at(b.photos)} />
                <VoiceTile c={c} style={at(b.voice)} />
                <LightTile c={c} style={at(b.light)} />
                <NotesTile c={c} style={at(b.notes)} />
                <MapTile c={c} style={at(b.map)} />
                <CalendarTile c={c} style={at(b.calendar)} />
              </>
            );
          })()
        : null}
    </View>
  );
}
