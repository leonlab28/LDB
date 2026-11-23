import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { PhotoImage } from '../components/PhotoThumb';
import { Label, Sub, Tile } from '../design/Glass';
import { Led } from '../design/Led';
import { C, F, LAMP, LAMP_LABEL, NOTE_BG } from '../design/tokens';
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
      <View style={styles.photoFoot}>
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

export function Lamps({ state, size = 12 }: { state: LightState | null; size?: number }) {
  const order: LightState[] = ['sleeping', 'busy', 'free'];
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

  return (
    <Tile style={style} onPress={isMe ? cycle : () => c.open('light')} onLongPress={isMe ? () => c.open('light') : undefined} label="Ampel">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Lamps state={cur?.state ?? null} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lightLabel} numberOfLines={1}>
            {cur ? LAMP_LABEL[cur.state] : '–'} {cur?.state === 'busy' && raw?.emoji ? raw.emoji : ''}
          </Text>
          <Sub style={{ fontSize: 12 }}>
            {cur?.until ? `bis ${formatClock(cur.until, tz)}` : raw?.note ? raw.note : isMe ? 'Tippen: wechseln' : cur ? 'offen' : 'kein Status'}
          </Sub>
        </View>
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
    <Tile style={[style, styles.voice]} onPress={toggle} label="Sprachnachricht">
      <View style={styles.voiceTop}>
        <Label>Sprache</Label>
        {v && !v.listenedAt ? <Dot color={C.alert} /> : null}
      </View>
      <Led text={v ? mmss(meta?.duration_ms ?? 0) : '--:--'} size={18} />
      <View style={[styles.playBtn, !v && { opacity: 0.3 }]}>
        <Text style={styles.playIcon}>{playing ? '■' : '▶'}</Text>
      </View>
      <Sub style={{ fontSize: 11 }}>{v ? agoLabel(v.recordedAt, c.now) : 'noch keine'}</Sub>
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
    <Tile style={[style, styles.voice, recording && { borderColor: C.alert, backgroundColor: 'rgba(255,59,48,0.12)' }]} onPressIn={rec.start} onPressOut={rec.stop} label="Gedrückt halten zum Aufnehmen">
      <View style={styles.voiceTop}>
        <Label>Sprache</Label>
        {mine?.listenedAt ? <Text style={{ color: C.fg3, fontSize: 11 }}>✓ gehört</Text> : null}
      </View>
      <Led text={recording ? mmss(elapsed) : mine ? mmss(meta?.duration_ms ?? 0) : '--:--'} size={18} color={recording ? C.lampRed : C.led} />
      <View style={[styles.micBtn, recording && { transform: [{ scale: 1.12 }] }]}>
        <Text style={{ fontSize: 18 }}>{rec.state === 'sending' ? '…' : '🎙'}</Text>
      </View>
      <Hint>{recording ? 'Loslassen: senden' : 'Halten: aufnehmen'}</Hint>
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

  return (
    <Tile style={style} onPress={() => c.open('notes')} label="Post-its">
      {top && body ? (
        <View style={[styles.postit, { backgroundColor: NOTE_BG[body.color] ?? NOTE_BG.yellow }]}>
          <Text style={styles.postitText} numberOfLines={5} adjustsFontSizeToFit minimumFontScale={0.7}>
            {body.text}
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.photoPlus}>{c.mode === 'me' ? '＋' : '🗒'}</Text>
          <Sub>{c.mode === 'me' ? 'Post-it schreiben' : 'Keine Post-its'}</Sub>
        </View>
      )}
      {unseen ? <Dot color={C.alert} style={{ position: 'absolute', top: 10, right: 10 }} /> : null}
      {notes.length > 1 ? <Text style={styles.more}>+{notes.length - 1}</Text> : null}
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

  return (
    <Tile
      style={style}
      padded={false}
      onPress={isMe ? share : () => c.open('map')}
      onLongPress={isMe ? () => c.open('map') : undefined}
      label="Standort"
    >
      {pos ? <MiniMap lat={pos.lat} lon={pos.lon} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: C.mapWater, opacity: 0.35 }]} />}
      <LinearGradient colors={['rgba(8,10,28,0.55)', 'transparent', 'rgba(8,10,28,0.8)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.mapInner} pointerEvents="none">
        {km != null ? (
          <View style={styles.badge}>
            <Led text={km.toLocaleString('de-DE').replace(/\./g, '')} size={12} />
            <Text style={styles.badgeUnit}>km</Text>
          </View>
        ) : (
          <View />
        )}
        <View>
          <Text style={styles.mapTitle} numberOfLines={1}>
            {loc?.paused ? 'pausiert' : pos ? (isMe ? 'Geteilt' : 'Standort') : 'Kein Standort'}
          </Text>
          <Sub style={{ fontSize: 12 }}>
            {busy
              ? 'Teile …'
              : c.view?.locationUpdatedAt && pos
                ? agoLabel(c.view.locationUpdatedAt, c.now)
                : isMe
                  ? 'Tippen: jetzt teilen'
                  : 'noch nicht geteilt'}
          </Sub>
        </View>
      </View>
    </Tile>
  );
}

// ---------------------------------------------------------------------------------------------
// Kalender (mittel bis klein). Platzhalter, bis die Kalender-Anbindung kommt.
// ---------------------------------------------------------------------------------------------

export function CalendarTile({ c, style }: TileProps) {
  return (
    <Tile style={style} onPress={() => c.open('calendar')} label="Kalender">
      <Label>Als Nächstes</Label>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <Sub lines={2} style={{ flex: 1 }}>
          Kalender kommt bald
        </Sub>
        <Led text="--:--" size={16} />
      </View>
    </Tile>
  );
}

const styles = StyleSheet.create({
  hint: { color: C.fg3, fontSize: 10.5, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  photoEmpty: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoPlus: { color: C.fg2, fontSize: 26 },
  photoFoot: { position: 'absolute', left: 14, right: 14, bottom: 12, gap: 2 },
  photoCount: { fontFamily: F.display, fontSize: 14, color: C.fg },
  lamps: { flexDirection: 'row', gap: 5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 999, backgroundColor: '#0b0d1a' },
  lightLabel: { fontFamily: F.display, fontSize: 16, color: C.fg },
  voice: { justifyContent: 'space-between', alignItems: 'flex-start', padding: 12 },
  voiceTop: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' },
  playBtn: { position: 'absolute', right: 10, bottom: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#1a1406', fontSize: 13, marginLeft: 2 },
  micBtn: { position: 'absolute', right: 10, bottom: 22, width: 38, height: 38, borderRadius: 19, backgroundColor: C.alert, alignItems: 'center', justifyContent: 'center' },
  postit: {
    flex: 1,
    padding: 10,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 2,
    transform: [{ rotate: '-2.5deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  postitText: { fontFamily: F.hand, fontSize: 22, lineHeight: 24, color: C.noteInk },
  more: { position: 'absolute', right: 10, bottom: 10, fontFamily: F.display, fontSize: 11, color: C.fg, backgroundColor: 'rgba(5,6,15,0.75)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  pin: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.amber, borderWidth: 2, borderColor: '#fff' },
  mapInner: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 12, justifyContent: 'space-between' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(5,6,15,0.7)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeUnit: { fontFamily: F.display, fontSize: 10, color: C.fg2 },
  mapTitle: { fontFamily: F.display, fontSize: 15, color: C.fg },
});
