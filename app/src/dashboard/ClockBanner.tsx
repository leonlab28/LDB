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
  const night = (() => {
    const h = hourIn(zone, now);
    return h >= 23 || h < 6;
  })();

  const nameSize = Math.max(18, Math.min(30, height * 0.14));
  const dayCol = Math.max(30, Math.min(44, width * 0.1));
  const headH = nameSize + 30;
  const ledSize = Math.max(28, Math.min((height - headH - 8) * 0.92, (width - dayCol - 14) / (ledWidth('88:88', 1) * 1.02)));
  const daySize = Math.max(7, Math.min(10, (height - headH) / 9.5));

  return (
    <View style={{ width, height, paddingHorizontal: 4 }}>
      <View style={styles.head}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.who, { fontSize: nameSize }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.where} numberOfLines={1}>
            {tz ? cityOf(tz) : 'Zeitzone noch nicht geteilt'}, {p.day}.{p.month}.
            {showDifference && tz ? `  ·  ${differenceLabel(myTz, tz, now)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {corner}
          {/* Wetter: Platzhalter, bis die Wetterdaten angebunden sind. */}
          <Text style={styles.wx} accessibilityLabel="Wetter noch nicht verfügbar">
            ☁︎ --°
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={{ width: dayCol, gap: daySize * 0.35 }}>
          {DAYS.map((d, i) => (
            <Text key={d} style={[styles.day, { fontSize: daySize, color: i === p.weekday ? C.led : C.ledGhost }]}>
              {d}
            </Text>
          ))}
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
  wx: { fontFamily: F.display, fontSize: 13, color: C.fg3 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  day: { fontFamily: F.display, letterSpacing: 0.8 },
});
