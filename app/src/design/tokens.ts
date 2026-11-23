// Design-Tokens aus dem Prototyp v2 (prototyp/app/css/tokens.css). Gleiche Namen, damit beide Seiten
// zusammenpassen. Farbe nur für Zustände, ein einziger Akzent (Bernstein).
import type { LightState, NoteColor } from '../lib/types';

export const C = {
  space1: '#141936',
  space2: '#0c0f24',
  space3: '#1a1233',
  panel: '#1c2146',

  glass: 'rgba(255,255,255,0.055)',
  glass2: 'rgba(255,255,255,0.09)',
  hairline: 'rgba(255,255,255,0.1)',

  fg: '#eef0ff',
  fg2: 'rgba(238,240,255,0.64)',
  fg3: 'rgba(238,240,255,0.42)',

  amber: '#ffb547',
  led: '#ffffff',
  ledGhost: 'rgba(255,255,255,0.075)',

  lampGreen: '#3ddc84',
  lampYellow: '#ffc93c',
  lampRed: '#ff4d4d',
  lampOff: '#23263a',
  newDot: '#0a84ff',
  alert: '#ff3b30',

  noteInk: '#3b3024',
  mapWater: '#12354a',
} as const;

export const NOTE_BG: Record<NoteColor, string> = {
  yellow: '#ffe27a',
  pink: '#ffb3c1',
  green: '#b6ecc8',
  blue: '#b9dcff',
};

/** Ampel: grün frei, gelb busy, rot schläft. */
export const LAMP: Record<LightState, string> = { free: C.lampGreen, busy: C.lampYellow, sleeping: C.lampRed };
export const LAMP_LABEL: Record<LightState, string> = { free: 'frei', busy: 'busy', sleeping: 'schläft' };

export const R = { hero: 30, tile: 22, inner: 14 } as const;
export const GAP = 10;

export const F = {
  display: 'Michroma',
  led: 'DSEG7',
  hand: 'Caveat',
} as const;
