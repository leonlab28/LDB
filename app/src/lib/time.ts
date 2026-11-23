/** Versatz einer Zeitzone zu UTC in Minuten, zum Zeitpunkt `at` (berücksichtigt Sommerzeit). */
export function offsetMinutes(tz: string, at = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatClock(at: number, tz?: string): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(at));
}

export function formatWeekday(at: number, tz?: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(at));
}

export function hourIn(tz: string, at = Date.now()): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date(at)));
}

/** "+7 Std." bzw. "−1,5 Std." aus Sicht von `mine`. */
export function differenceLabel(mine: string, theirs: string, at = Date.now()): string {
  const diff = (offsetMinutes(theirs, at) - offsetMinutes(mine, at)) / 60;
  if (diff === 0) return 'gleiche Uhrzeit';
  const n = Math.abs(diff).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return `${diff > 0 ? '+' : '−'}${n} Std.`;
}

export function dayEmoji(hour: number): string {
  if (hour >= 5 && hour < 8) return '🌅';
  if (hour >= 8 && hour < 18) return '☀️';
  if (hour >= 18 && hour < 22) return '🌆';
  return '🌙';
}

export function remainingLabel(until: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((until - now) / 60000));
  if (min < 60) return `noch ${min} Min.`;
  return `noch ${Math.round(min / 60)} Std.`;
}

export function agoLabel(at: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - at) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} Std.`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}

// Deutsche Namen für Städte, deren IANA-Name englisch ist (Rest: Unterstriche zu Leerzeichen).
const CITY_DE: Record<string, string> = {
  Hong_Kong: 'Hongkong',
  Vienna: 'Wien',
  Zurich: 'Zürich',
  Rome: 'Rom',
  Prague: 'Prag',
  Warsaw: 'Warschau',
  Lisbon: 'Lissabon',
  Copenhagen: 'Kopenhagen',
  Brussels: 'Brüssel',
  Moscow: 'Moskau',
  Athens: 'Athen',
  Bucharest: 'Bukarest',
  Belgrade: 'Belgrad',
  Kiev: 'Kiew',
  Kyiv: 'Kiew',
  Singapore: 'Singapur',
  Tokyo: 'Tokio',
  Shanghai: 'Schanghai',
  Macau: 'Macau',
  Taipei: 'Taipeh',
  Bangkok: 'Bangkok',
  Mexico_City: 'Mexiko-Stadt',
};

/** Stadt aus einer IANA-Zeitzone, z. B. "Asia/Hong_Kong" → "Hongkong". */
export function cityOf(tz: string): string {
  const last = tz.split('/').pop() ?? tz;
  return CITY_DE[last] ?? last.replace(/_/g, ' ');
}
