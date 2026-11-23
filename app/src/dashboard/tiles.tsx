import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { PhotoImage } from '../components/PhotoThumb';
import { ICC_PAD, Label, Sub, Tile } from '../design/Glass';
import { useIcc } from '../design/skin';
import { Stamped } from '../skins/icc/Stamped';
import { Led } from '../design/Led';
import { C, F, LAMP, LAMP_LABEL, NOTE_ACCENT } from '../design/tokens';
import { distanceKm, roundCoord } from '../lib/geo';
import { currentLight } from '../lib/light';
import { pickAndSharePhotos } from '../lib/photos';
import { agoLabel, formatClock, remainingLabel } from '../lib/time';
import type { LightState } from '../lib/types';
import { mmss, playPartnerVoice, stopVoice, useHoldToRecord } from '../lib/voice';
import * as ExpoLocation from 'expo-location';
import { sendsReceipts, type DashCtx } from './context';

type TileProps = { c: DashCtx; style: StyleProp<ViewStyle> };

const opened = <T,>(v: T | 'locked' | null | undefined): T | null => (v && v !== 'locked' ? v : null);

function Hint({ children }: { children: string }) {
  return (
    <Text style={styles.hint} numberOfLines={1}>
      {children}
    </Text>
  );
}

function Dot({ color = C.newDot, style }: { color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }, style]} />;
}

// ---------------------------------------------------------------------------------------------
// Fotos (groß)
// ---------------------------------------------------------------------------------------------

export function PhotosTile({ c, style }: TileProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const photos = [...(c.view?.photos ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const newest = photos[0];
  const oldest = photos[photos.length - 1];
  const unseen = c.mode === 'partner' && photos.some((p) => !p.seenAt);

  async function add() {
    try {
      const n = await pickAndSharePhotos(c.api, null, (done, total) => setProgress({ done, total }));
      if (n) c.toast(n === 1 ? 'Foto geteilt' : `${n} Fotos geteilt`);
      c.refresh();
    } catch (e) {
      Alert.alert('Hat nicht geklappt', e instanceof Error ? e.message : String(e));
      c.refresh();
    } finally {
      setProgress(null);
    }
  }

  const isMe = c.mode === 'me';
  const icc = useIcc();
  return (
    <Tile
      style={style}
      padded={false}
      onPress={isMe ? add : () => c.open('photos')}
      onLongPress={isMe ? () => c.open('photos') : undefined}
      label={isMe ? 'Fotos teilen' : 'Fotos ansehen'}
    >
      {newest ? <PhotoImage load={c.loadPhoto} id={newest.id} size={newest.hasThumb ? 'thumb' : 'full'} style={StyleSheet.absoluteFill} /> : null}
      {newest ? (
        <LinearGradient colors={['transparent', 'rgba(8,10,28,0.85)']} style={styles.photoShade} />
      ) : (
        <View style={styles.photoEmpty}>
          <Text style={styles.photoPlus}>{isMe ? '＋' : '📷'}</Text>
          <Sub style={{ textAlign: 'center' }}>{isMe ? 'Fotos teilen' : 'Heute noch keine Fotos'}</Sub>
        </View>
      )}
      <View style={[styles.photoFoot, icc && { left: ICC_PAD, right: ICC_PAD, bottom: ICC_PAD }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.photoCount}>
            {progress ? `Lädt ${progress.done}/${progress.total}` : photos.length ? `${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'}` : ''}
          </Text>
          {unseen ? <Dot /> : null}
        </View>
        {oldest && !progress ? <Sub>ältestes geht {remainingLabel(oldest.expiresAt, c.now).replace('noch ', 'in ')}</Sub> : null}
        {isMe ? <Hint>{photos.length ? 'Tippen: mehr teilen · Halten: verwalten' : 'Tippen: auswählen'}</Hint> : null}
      </View>
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Ampel (schmal)
// ---------------------------------------------------------------------------------------------

export function Lamps({ state, size = 11 }: { state: LightState | null; size?: number }) {
  const order: LightState[] = ['sleeping', 'busy', 'free'];
  if (useIcc()) {
    // ICC: drei Neonringe, nur der aktive leuchtet, die anderen sind kaltes Glas
    const d = Math.round(size * 2);
    return (
      <View style={{ flexDirection: 'row', gap: d * 0.35 }}>
        {order.map((s) => {
          const on = state === s;
          return (
            <View
              key={s}
              style={{
                width: d,
                height: d,
                borderRadius: d / 2,
                borderWidth: Math.max(3, d * 0.13),
                borderColor: on ? LAMP[s] : '#2a2d34',
                shadowColor: LAMP[s],
                shadowOpacity: on ? 1 : 0,
                shadowRadius: d * 0.35,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.lamps}>
      {order.map((s) => {
        const on = state === s;
        return (
          <View
            key={s}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: on ? LAMP[s] : C.lampOff,
              shadowColor: LAMP[s],
              shadowOpacity: on ? 0.9 : 0,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        );
      })}
    </View>
  );
}

const CYCLE: LightState[] = ['free', 'busy', 'sleeping'];

export function LightTile({ c, style }: TileProps) {
  const raw = opened(c.view?.light);
  const cur = raw ? currentLight(raw, c.now) : null;
  const tz = opened(c.view?.profile)?.tz;
  const isMe = c.mode === 'me';
  const [busy, setBusy] = useState(false);
  const icc = useIcc();

  async function cycle() {
    if (busy) return;
    const next = CYCLE[(CYCLE.indexOf(cur?.state ?? 'sleeping') + 1) % CYCLE.length];
    setBusy(true);
    try {
      // Gilt bis zur nächsten Änderung bzw. später bis zum nächsten Wechsel im Wochenplan.
      await c.api.putLight({ manual: { state: next, until: null }, emoji: next === 'busy' ? (raw?.emoji ?? null) : null, note: raw?.note ?? null, plan: raw?.plan });
      c.refresh();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sub = cur?.until ? `bis ${formatClock(cur.until, tz)}` : isMe && !cur ? 'tippen' : '';
  const label = (cur ? LAMP_LABEL[cur.state] : 'kein Status') + (cur?.state === 'busy' && raw?.emoji ? ` ${raw.emoji}` : '');

  if (icc)
    // ICC: Ringe mittig, darunter Status und Hinweis, alles als eine zentrierte Gruppe
    return (
      <Tile style={style} contentStyle={styles.iccLight} onPress={isMe ? cycle : () => c.open('light')} onLongPress={isMe ? () => c.open('light') : undefined} label="Ampel">
        <Lamps state={cur?.state ?? null} size={13} />
        <View style={{ alignItems: 'center', gap: 3, alignSelf: 'stretch' }}>
          <Text style={[styles.lightLabel, !cur && { color: C.fg3, fontSize: 13 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {label}
          </Text>
          {sub ? <Text style={styles.lightSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </Tile>
    );

  return (
    <Tile style={style} onPress={isMe ? cycle : () => c.open('light')} onLongPress={isMe ? () => c.open('light') : undefined} label="Ampel">
      <View style={styles.lightCol}>
        <View style={styles.lightTop}>
          <Lamps state={cur?.state ?? null} />
          <Text style={styles.lightSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {cur?.until ? `bis ${formatClock(cur.until, tz)}` : isMe && !cur ? 'tippen' : ''}
          </Text>
        </View>
        <Text style={[styles.lightLabel, !cur && { color: C.fg3, fontSize: 13 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {cur ? LAMP_LABEL[cur.state] : 'kein Status'}
          {cur?.state === 'busy' && raw?.emoji ? ` ${raw.emoji}` : ''}
        </Text>
      </View>
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Sprachnachricht (klein, quadratisch)
// ---------------------------------------------------------------------------------------------

export function VoiceTile({ c, style }: TileProps) {
  return c.mode === 'me' ? <MyVoiceTile c={c} style={style} /> : <PartnerVoiceTile c={c} style={style} />;
}

function PartnerVoiceTile({ c, style }: TileProps) {
  const v = c.view?.voice ?? null;
  const meta = opened(v?.meta);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopVoice(), []);

  async function toggle() {
    if (!v) return;
    if (playing) {
      stopVoice();
      setPlaying(false);
      return;
    }
    if (c.mirror) {
      c.toast('In der Vorschau lässt sich die eigene Nachricht nicht abspielen.');
      return;
    }
    try {
      setPlaying(true);
      await playPartnerVoice(c.api, v.id, () => setPlaying(false));
      if (sendsReceipts(c) && !v.listenedAt) c.api.markVoiceListened(v.id).then(c.refresh, () => {});
    } catch (e) {
      setPlaying(false);
      c.toast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Tile style={style} contentStyle={styles.voice} onPress={toggle} label="Sprachnachricht">
      <View style={styles.voiceTop}>
        <Label>Sprache</Label>
        {v && !v.listenedAt ? <Dot color={C.alert} /> : null}
      </View>
      <Led text={v ? mmss(meta?.duration_ms ?? 0) : '--:--'} size={16} />
      <View style={[styles.roundBtn, { backgroundColor: C.amber }, !v && { opacity: 0.3 }]}>
        <Text style={styles.playIcon}>{playing ? '■' : '▶'}</Text>
      </View>
      <Text style={styles.voiceFoot} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {v ? agoLabel(v.recordedAt, c.now) : 'noch keine'}
      </Text>
    </Tile>
  );
}

function MyVoiceTile({ c, style }: TileProps) {
  const mine = c.view?.voice ?? null;
  const rec = useHoldToRecord(c.api, c.myTz, () => {
    c.toast('Sprachnachricht geschickt');
    c.refresh();
  }, c.toast);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (rec.state !== 'recording') return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [rec.state]);
  const elapsed = rec.startedAt ? Date.now() - rec.startedAt : 0;
  void tick;
  const recording = rec.state === 'recording';
  const meta = opened(mine?.meta);

  return (
    <Tile style={[style, recording && { borderColor: C.alert, backgroundColor: 'rgba(255,59,48,0.12)' }]} contentStyle={styles.voice} onPressIn={rec.start} onPressOut={rec.stop} label="Gedrückt halten zum Aufnehmen">
      <View style={styles.voiceTop}>
        <Label>Sprache</Label>
        {mine?.listenedAt ? <Text style={{ color: C.fg3, fontSize: 11 }}>✓ gehört</Text> : null}
      </View>
      <Led text={recording ? mmss(elapsed) : mine ? mmss(meta?.duration_ms ?? 0) : '--:--'} size={16} color={recording ? C.lampRed : C.led} />
      <View style={[styles.roundBtn, { backgroundColor: C.alert }, recording && { transform: [{ scale: 1.12 }] }]}>
        <Text style={{ fontSize: 17 }}>{rec.state === 'sending' ? '…' : '🎙'}</Text>
      </View>
      <Text style={styles.voiceFoot} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {recording ? 'loslassen: senden' : 'halten: aufnehmen'}
      </Text>
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Post-its (mittel)
// ---------------------------------------------------------------------------------------------

export function NotesTile({ c, style }: TileProps) {
  const notes = [...(c.view?.notes ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const top = notes[0];
  const body = opened(top?.body);
  const unseen = c.mode === 'partner' && notes.some((n) => !n.seenAt);
  const icc = useIcc();

  if (icc) {
    // ICC: die ganze Kachel ist eine glatte Alu-Platte, die Schrift ist mit der Schreibmaschine eingeschlagen.
    const tz = opened(c.view?.profile)?.tz;
    const text = notes
      .map((n) => opened(n.body)?.text)
      .filter(Boolean)
      .join('  ·  ');
    return (
      <Tile style={style} face="plate" onPress={() => c.open('notes')} label="Notiz">
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          {text ? (
            <Stamped text={text} size={15} maxChars={110} />
          ) : (
            <Stamped text={c.mode === 'me' ? 'Notiz schreiben …' : 'Keine Notiz'} size={15} />
          )}
          {top ? <Stamped text={`${formatClock(top.createdAt, tz)} · ${remainingLabel(top.expiresAt, c.now).toUpperCase()}`} size={9} seed={7} /> : null}
        </View>
        {unseen ? <View style={styles.iccNew} /> : null}
      </Tile>
    );
  }

  return (
    <Tile style={style} onPress={() => c.open('notes')} label="Post-its">
      <View style={styles.tileHead}>
        <Label>Post-its</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {unseen ? <Dot color={C.amber} /> : null}
          {notes.length ? <Text style={styles.count}>{notes.length}</Text> : null}
        </View>
      </View>
      {top && body ? (
        <View style={{ flex: 1, gap: 8, marginTop: 8 }}>
          <View style={[styles.noteMain, { borderLeftColor: NOTE_ACCENT[body.color] ?? C.amber }]}>
            <Text style={styles.noteText} numberOfLines={notes.length > 1 ? 3 : 5}>
              {body.text}
            </Text>
          </View>
          {notes.slice(1, 3).map((n) => {
            const b = opened(n.body);
            return (
              <View key={n.id} style={styles.noteRow}>
                <Dot color={b ? NOTE_ACCENT[b.color] : C.fg3} style={{ width: 6, height: 6 }} />
                <Text style={styles.noteLine} numberOfLines={1}>
                  {b ? b.text : '🔒'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.photoPlus}>{c.mode === 'me' ? '＋' : '–'}</Text>
          <Sub>{c.mode === 'me' ? 'Post-it schreiben' : 'Keine Post-its'}</Sub>
        </View>
      )}
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Standort-Minimap (mittel)
// ---------------------------------------------------------------------------------------------

export async function shareLocationNow(c: DashCtx) {
  const perm = await ExpoLocation.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error('Standortzugriff ist in den Einstellungen deaktiviert.');
  const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
  await c.api.putLocation({ lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) });
}

export function MiniMap({ lat, lon, interactive = false }: { lat: number; lon: number; interactive?: boolean }) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      pointerEvents={interactive ? 'auto' : 'none'}
      userInterfaceStyle="dark"
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      showsPointsOfInterests={false}
      region={{ latitude: lat, longitude: lon, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
    >
      <Marker coordinate={{ latitude: lat, longitude: lon }} anchor={{ x: 0.5, y: 0.5 }}>
        <View style={styles.pin} />
      </Marker>
    </MapView>
  );
}

export function MapTile({ c, style }: TileProps) {
  const loc = opened(c.view?.location);
  const pos = loc && !loc.paused ? loc : null;
  const myLoc = opened(c.me?.location);
  const myPos = myLoc && !myLoc.paused ? myLoc : null;
  const isMe = c.mode === 'me';
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      await shareLocationNow(c);
      c.toast('Standort geteilt');
      c.refresh();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const km = pos && myPos && !isMe && !c.mirror ? Math.round(distanceKm(pos, myPos)) : null;
  const icc = useIcc();

  return (
    <Tile
      style={style}
      padded={false}
      onPress={isMe ? share : () => c.open('map')}
      onLongPress={isMe ? () => c.open('map') : undefined}
      label="Standort"
    >
      {pos ? <MiniMap lat={pos.lat} lon={pos.lon} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: C.mapWater, opacity: 0.35 }]} />}
      {/* Text nur oben: unten links und rechts sitzen Apple-Logo und „Rechtliches“ der Karte. */}
      <LinearGradient colors={['rgba(8,10,28,0.85)', 'rgba(8,10,28,0.25)', 'transparent']} locations={[0, 0.5, 1]} style={styles.mapShade} pointerEvents="none" />
      <View style={[styles.mapInner, icc && { padding: ICC_PAD }]} pointerEvents="none">
        <View style={{ flexShrink: 1 }}>
          <Label>{loc?.paused ? 'Pausiert' : isMe ? 'Mein Standort' : 'Standort'}</Label>
          <Text style={styles.mapSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {busy
              ? 'teile …'
              : c.view?.locationUpdatedAt && pos
                ? agoLabel(c.view.locationUpdatedAt, c.now)
                : isMe
                  ? 'tippen: jetzt teilen'
                  : 'noch nicht geteilt'}
          </Text>
        </View>
        {km != null ? (
          <View style={styles.badge}>
            <Led text={String(km)} size={11} />
            <Text style={styles.badgeUnit}>km</Text>
          </View>
        ) : null}
      </View>
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Kalender (mittel bis klein). Platzhalter, bis die Kalender-Anbindung kommt.
// ---------------------------------------------------------------------------------------------

export function CalendarTile({ c, style }: TileProps) {
  return (
    <Tile style={style} contentStyle={styles.calendar} onPress={() => c.open('calendar')} label="Kalender">
      <View style={{ flex: 1, gap: 4 }}>
        <Label>Als Nächstes</Label>
        <Text style={styles.calText} numberOfLines={1}>
          Kalender kommt bald
        </Text>
      </View>
      <Led text="--:--" size={16} />
    </Tile>
  );
}

// Einheitliche Maße für alle Kacheln: Innenabstand 12 (Glass.Tile), runde Knöpfe 40, Labels 10.5 Michroma.
const BTN = 40;

const styles = StyleSheet.create({
  hint: { color: C.fg3, fontSize: 10.5, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontFamily: F.display, fontSize: 10.5, color: C.fg2, backgroundColor: C.glass2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  photoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  photoEmpty: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoPlus: { color: C.fg2, fontSize: 24 },
  photoFoot: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 2 },
  photoCount: { fontFamily: F.display, fontSize: 13, color: C.fg },
  iccNew: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffb547', shadowColor: '#ffb547', shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  lamps: { flexDirection: 'row', gap: 5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 999, backgroundColor: '#0b0d1a' },
  lightCol: { flex: 1, justifyContent: 'space-between' },
  lightTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  lightSub: { flexShrink: 1, color: C.fg2, fontSize: 11 },
  lightLabel: { fontFamily: F.display, fontSize: 15, color: C.fg },
  voice: { justifyContent: 'space-between', alignItems: 'center' },
  voiceTop: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' },
  voiceFoot: { color: C.fg3, fontSize: 10.5, alignSelf: 'stretch', textAlign: 'center' },
  roundBtn: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#1a1406', fontSize: 14, marginLeft: 2 },
  noteMain: { borderLeftWidth: 3, paddingLeft: 10, flexShrink: 1 },
  noteText: { color: C.fg, fontSize: 15, lineHeight: 20 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteLine: { flex: 1, color: C.fg2, fontSize: 13 },
  pin: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.amber, borderWidth: 2, borderColor: '#fff' },
  mapShade: { position: 'absolute', left: 0, right: 0, top: 0, height: '60%' },
  mapInner: { position: 'absolute', left: 0, right: 0, top: 0, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  mapSub: { color: C.fg, fontSize: 13, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(5,6,15,0.75)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeUnit: { fontFamily: F.display, fontSize: 9.5, color: C.fg2 },
  calendar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iccLight: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  calText: { color: C.fg2, fontSize: 13 },
});
