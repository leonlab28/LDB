import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Led, ledWidth } from '../design/Led';
import { C, F } from '../design/tokens';
import { differenceLabel, hourIn } from '../lib/time';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function parts(at: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { hh: get('hour'), mm: get('minute'), day: get('day'), month: get('month'), weekday: wd };
}

/** "Asia/Hong_Kong" -> "Hong Kong" */
export function cityOf(tz: string): string {
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}

/** In Expo Go schwebt oben rechts der Entwickler-Knopf. Dort nichts Wichtiges hinlegen. */
const DEV_RIGHT_GAP = __DEV__ ? 54 : 0;

/**
 * Eingebettete Uhr mit Tag und Wetter. Keine Kachel, kein Rahmen: sie liegt direkt auf dem Hintergrund,
 * im Hochformat als Banner oben, im Querformat links oben.
 */
export function ClockBanner({
  name,
  tz,
  myTz,
  now,
  width,
  height,
  showDifference,
  corner,
}: {
  name: string;
  tz: string | null;
  myTz: string;
  now: number;
  width: number;
  height: number;
  showDifference: boolean;
  corner?: ReactNode;
}) {
  const zone = tz ?? myTz;
  const p = parts(now, zone);
  const h = hourIn(zone, now);
  const night = h >= 23 || h < 6;

  const nameSize = Math.max(18, Math.min(28, height * 0.13));
  const headH = nameSize + 26;
  const dayW = Math.max(34, Math.min(52, width * 0.11));
  const ledSize = Math.max(28, Math.min((height - headH - 6) * 0.9, (width - dayW - 12) / (ledWidth('88:88', 1) * 1.02)));
  const daySize = Math.max(10, Math.min(15, ledSize * 0.17));

  return (
    <View style={{ width, height }}>
      <View style={[styles.head, { paddingRight: DEV_RIGHT_GAP }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.who, { fontSize: nameSize }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.where} numberOfLines={1}>
            {tz ? cityOf(tz) : 'Zeitzone noch nicht geteilt'}
            {showDifference && tz ? `  ·  ${differenceLabel(myTz, tz, now)}` : ''}
            {/* Wetter: Platzhalter, bis die Wetterdaten angebunden sind. */}
            {'  ·  '}
            <Text style={styles.wx}>☁︎ --°</Text>
          </Text>
        </View>
        {corner}
      </View>
      <View style={styles.body}>
        <View style={{ width: dayW, gap: 4 }}>
          <Text style={[styles.day, { fontSize: daySize }]}>{DAYS[p.weekday] ?? ''}</Text>
          <Text style={[styles.date, { fontSize: daySize * 0.8 }]}>
            {p.day}.{p.month}.
          </Text>
        </View>
        <Led text={`${p.hh}:${p.mm}`} size={ledSize} dim={night} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  who: { fontFamily: F.display, color: C.fg, letterSpacing: 0.3 },
  where: { color: C.fg2, fontSize: 13, marginTop: 4 },
  wx: { color: C.fg, fontSize: 13 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  day: { fontFamily: F.display, letterSpacing: 1, color: C.led },
  date: { fontFamily: F.display, color: C.fg3 },
});
