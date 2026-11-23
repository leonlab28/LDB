import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { F } from '../../design/tokens';
import { differenceLabel, hourIn } from '../../lib/time';
import { NeonCoil, NeonText, neonTextWidth } from './Neon';

const DAYS = ['MONTAG', 'DIENSTAG', 'MITTWOCH', 'DONNERSTAG', 'FREITAG', 'SAMSTAG', 'SONNTAG'];
const MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function parts(at: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(at));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { hh: get('hour'), mm: get('minute'), day: get('day'), month: Number(get('month')) - 1, weekday: wd };
}

const cityOf = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
const DEV_RIGHT_GAP = __DEV__ ? 54 : 0;

/**
 * ICC-Skin: Uhr aus Neon-Röhren direkt auf der Lamellendecke, darunter Ort, Tag und Temperatur
 * (kleines Cyan-Neon), unten die Neon-Spirale als Trenner. Kein Rahmen, gehört zum Hintergrund.
 */
export function IccClockBanner({
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
  const win = useWindowDimensions();
  const landscape = win.width > win.height * 1.1;

  const metaH = 42;
  const coilH = 26;
  const top = corner || DEV_RIGHT_GAP ? 6 : 0;
  const clockH = Math.max(40, Math.min(height - metaH - coilH - top - 14, ((width - 24) * 100) / neonTextWidth('88:88', 100)));
  const clockW = neonTextWidth('88:88', clockH);
  const tempH = 24;

  return (
    <View style={{ width, height }}>
      {corner ? <View style={[styles.corner, { right: DEV_RIGHT_GAP }]}>{corner}</View> : null}
      <View style={{ marginTop: top + clockH * 0.14, alignItems: landscape ? 'flex-start' : 'center', paddingLeft: landscape ? 12 : 0, opacity: night ? 0.75 : 1 }}>
        <View style={{ width: clockW, height: clockH }}>
          <NeonText text={`${p.hh}:${p.mm}`} height={clockH} color="red" />
        </View>
      </View>
      <View style={[styles.meta, { bottom: coilH, height: metaH }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.city} numberOfLines={1}>
            {(tz ? cityOf(tz) : name).toUpperCase()}
          </Text>
          <Text style={styles.day} numberOfLines={1}>
            {DAYS[p.weekday] ?? ''} · {p.day}. {MONTHS[p.month] ?? ''}
            {showDifference && tz ? `  ·  ${differenceLabel(myTz, tz, now)}` : ''}
          </Text>
        </View>
        {/* Wetter: Platzhalter, bis die Wetterdaten angebunden sind. */}
        <View style={{ width: neonTextWidth('--°', tempH), height: tempH, marginRight: 6 }}>
          <NeonText text="--°" height={tempH} color="cyan" />
        </View>
      </View>
      <View style={[styles.coil, { height: coilH }]}>
        <NeonCoil width={landscape ? width : width - 40} height={coilH} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', top: 0, zIndex: 2 },
  meta: { position: 'absolute', left: 18, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  city: { fontFamily: F.display, fontSize: 13, letterSpacing: 2.6, color: '#e9ecf2' },
  day: { fontFamily: F.display, fontSize: 10, letterSpacing: 2, color: '#8a93a3', marginTop: 5 },
  coil: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
