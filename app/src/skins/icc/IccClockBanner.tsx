import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { F } from '../../design/tokens';
import { cityOf, differenceLabel, hourIn } from '../../lib/time';
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

  // Von oben nach unten: Kopfzeile (Umschalter), Neon-Uhr, Ort/Tag/Temperatur, Spirale.
  const headH = corner ? HEAD_H : 0;
  const metaH = 40;
  const coilH = 22;
  const gapTop = 8; // Kopfzeile → Uhr
  const gapMeta = 12; // Uhr → Ort
  const gapCoil = 8; // Ort → Spirale
  // Hochformat: Uhr mittig, aber nicht unter den Expo-Knopf rechts (nur in der Entwicklung)
  const maxW = landscape ? width - 24 : width - 24 - 2 * DEV_RIGHT_GAP;
  const room = height - headH - gapTop - gapMeta - metaH - gapCoil - coilH;
  const clockH = Math.max(40, Math.min(room, (maxW * 100) / neonTextWidth('88:88', 100)));
  const slack = Math.max(0, room - clockH) / 2; // wenn die Breite begrenzt: Uhr mittig im freien Raum
  const clockW = neonTextWidth('88:88', clockH);
  const tempH = 34;

  return (
    <View style={{ width, height }}>
      {corner ? <View style={[styles.head, { height: headH, paddingRight: DEV_RIGHT_GAP }]}>{corner}</View> : null}
      <View style={{ marginTop: gapTop + slack, height: clockH, alignItems: landscape ? 'flex-start' : 'center', paddingLeft: landscape ? 18 : 0, opacity: night ? 0.75 : 1 }}>
        <View style={{ width: clockW, height: clockH }}>
          <NeonText text={`${p.hh}:${p.mm}`} height={clockH} color="red" />
        </View>
      </View>
      <View style={[styles.meta, { marginTop: gapMeta + slack, height: metaH }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.city} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {(tz ? cityOf(tz) : 'Zeitzone noch nicht geteilt').toUpperCase()}
          </Text>
          <Text style={styles.day} numberOfLines={1}>
            {DAYS[p.weekday] ?? ''} · {p.day}. {MONTHS[p.month] ?? ''}
            {showDifference && tz ? `  ·  ${differenceLabel(myTz, tz, now)}` : ''}
          </Text>
        </View>
        {/* Wetter: Platzhalter, bis die Wetterdaten angebunden sind. */}
        <View style={{ width: neonTextWidth('--°', tempH), height: tempH }}>
          <NeonText text="--°" height={tempH} color="cyan" />
        </View>
      </View>
      <View style={[styles.coil, { height: coilH }]}>
        <NeonCoil width={width - 36} height={coilH} />
      </View>
    </View>
  );
}

/** Höhe der Kopfzeile mit dem Umschalter. Das Dashboard gibt der ICC-Uhr diese Höhe zusätzlich. */
export const HEAD_H = 36;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  meta: { marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  city: { fontFamily: F.display, fontSize: 13, letterSpacing: 2.6, color: '#e9ecf2' },
  day: { fontFamily: F.display, fontSize: 10, letterSpacing: 2, color: '#8a93a3', marginTop: 5 },
  coil: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
