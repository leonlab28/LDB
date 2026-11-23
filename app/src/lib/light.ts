import type { Light, LightState } from './types';

export const LIGHT_LABEL: Record<LightState, string> = { free: 'Frei', busy: 'Beschäftigt', sleeping: 'Schläft' };
export const LIGHT_COLOR: Record<LightState, string> = { free: '#2FB36B', busy: '#E5484D', sleeping: '#6E56CF' };

/** Aktueller Zustand: manuelle Einstellung, solange sie gilt. Der Wochenplan wird später ausgewertet. */
export function currentLight(light: Light | null, now = Date.now()): { state: LightState; until: number | null } | null {
  const m = light?.manual;
  if (!m) return null;
  if (m.until != null && m.until <= now) return null;
  return m;
}

/** Nächster Zeitpunkt mit der angegebenen Uhrzeit in der Ortszeit des Geräts. */
export function nextLocalTime(hour: number, now = new Date()): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
