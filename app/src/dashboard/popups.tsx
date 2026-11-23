import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PhotoImage } from '../components/PhotoThumb';
import { Chip, Label, PillButton, Popup, Sub } from '../design/Glass';
import { Led } from '../design/Led';
import { C, F, LAMP, LAMP_LABEL, NOTE_ACCENT } from '../design/tokens';
import { distanceKm } from '../lib/geo';
import { currentLight, nextLocalTime } from '../lib/light';
import { pickAndSharePhotos } from '../lib/photos';
import { agoLabel, formatClock, remainingLabel } from '../lib/time';
import type { LightState, NoteColor } from '../lib/types';
import { sendsReceipts, type DashCtx, type PopupKind } from './context';
import { Lamps, MiniMap, shareLocationNow } from './tiles';
import { LinearGradient } from 'expo-linear-gradient';
import { PLATE } from '../design/Glass';
import { SKINS, useIcc, useSkin } from '../design/skin';
import { Stamped } from '../skins/icc/Stamped';

const opened = <T,>(v: T | 'locked' | null | undefined): T | null => (v && v !== 'locked' ? v : null);

type P = { c: DashCtx; visible: boolean; onClose: () => void };

export function Popups({ c, which, onClose, settings }: { c: DashCtx; which: PopupKind | null; onClose: () => void; settings: React.ReactNode }) {
  return (
    <>
      <PhotosPopup c={c} visible={which === 'photos'} onClose={onClose} />
      <LightPopup c={c} visible={which === 'light'} onClose={onClose} />
      <NotesPopup c={c} visible={which === 'notes'} onClose={onClose} />
      <MapPopup c={c} visible={which === 'map'} onClose={onClose} />
      <CalendarPopup c={c} visible={which === 'calendar'} onClose={onClose} />
      {settings}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Fotos: durchwischen, Herz (Drüben) bzw. löschen (Ich)
// ---------------------------------------------------------------------------------------------

function PhotosPopup({ c, visible, onClose }: P) {
  const photos = useMemo(() => [...(c.view?.photos ?? [])].sort((a, b) => b.createdAt - a.createdAt), [c.view?.photos]);
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const marked = useRef(new Set<string>());
  const isMe = c.mode === 'me';

  useEffect(() => {
    if (!visible) setIndex(0);
  }, [visible]);

  // Gesehen, sobald ein Foto im Pop-up angezeigt wird.
  const cur = photos[index];
  useEffect(() => {
    if (!visible || !cur || !sendsReceipts(c) || cur.seenAt || marked.current.has(cur.id)) return;
    marked.current.add(cur.id);
    c.api.markPhoto(cur.id, 'seen').catch(() => marked.current.delete(cur.id));
  }, [visible, cur, c]);

  async function add() {
    try {
      const n = await pickAndSharePhotos(c.api, null, (d, t) => setAdding(`${d}/${t}`));
      if (n) c.toast(n === 1 ? 'Foto geteilt' : `${n} Fotos geteilt`);
    } catch (e) {
      Alert.alert('Hat nicht geklappt', e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
      c.refresh();
    }
  }

  function remove(id: string) {
    Alert.alert('Foto löschen?', 'Es verschwindet sofort auch bei deinem Freund.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => c.api.deletePhoto(id).then(c.refresh, (e) => c.toast(String(e))) },
    ]);
  }

  return (
    <Popup
      visible={visible}
      onClose={onClose}
      title={photos.length ? `Fotos  ${index + 1}/${photos.length}` : 'Fotos'}
      scroll={false}
      wide
      right={isMe ? <PillButton title={adding ? `Lädt ${adding}` : '＋ Fotos'} onPress={add} disabled={!!adding} /> : undefined}
    >
      {photos.length === 0 ? (
        <Sub style={{ paddingVertical: 30, textAlign: 'center' }}>{isMe ? 'Du hast heute noch nichts geteilt.' : 'Heute noch keine Fotos.'}</Sub>
      ) : (
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexShrink: 1 }}>
          {w > 0 ? (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(p) => p.id}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))}
              renderItem={({ item }) => {
                const meta = opened(item.meta);
                return (
                  <View style={{ width: w, gap: 10 }}>
                    <PhotoImage load={c.loadPhoto} id={item.id} size="full" contain style={styles.bigPhoto} />
                    {meta?.caption ? <Text style={styles.caption}>{meta.caption}</Text> : null}
                    <View style={styles.rowBetween}>
                      <Sub>
                        {formatClock(item.createdAt)} · {remainingLabel(item.expiresAt, c.now)}
                        {isMe && item.seenAt ? ' · 👀 gesehen' : ''}
                        {isMe && item.keptAt ? ' · ❤️' : ''}
                      </Sub>
                      {isMe ? (
                        <PillButton title="Löschen" kind="danger" onPress={() => remove(item.id)} />
                      ) : (
                        <PillButton
                          title={item.keptAt ? '❤️ Behalten' : '🤍 Herz'}
                          onPress={() => {
                            if (item.keptAt || !sendsReceipts(c)) return;
                            c.api.markPhoto(item.id, 'keep').then(c.refresh, () => {});
                          }}
                        />
                      )}
                    </View>
                  </View>
                );
              }}
            />
          ) : null}
        </View>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------------------------
// Ampel: Details (Drüben) bzw. feiner einstellen (Ich)
// ---------------------------------------------------------------------------------------------

const EMOJIS = ['💼', '🍜', '🏃', '🎮', '🚇', '✈️', '📚', '🎉'];
const DURATIONS = [
  { label: '1 Std.', until: () => Date.now() + 3600_000 },
  { label: '3 Std.', until: () => Date.now() + 3 * 3600_000 },
  { label: 'bis 8 Uhr', until: () => nextLocalTime(8) },
  { label: 'offen', until: () => null },
] as const;

function LightPopup({ c, visible, onClose }: P) {
  const raw = opened(c.view?.light);
  const cur = raw ? currentLight(raw, c.now) : null;
  const tz = opened(c.view?.profile)?.tz;
  const isMe = c.mode === 'me';

  const [state, setState] = useState<LightState>('free');
  const [dur, setDur] = useState(3);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setState(cur?.state ?? 'free');
    setDur(3);
    setEmoji(raw?.emoji ?? null);
    setNote(raw?.note ?? '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      await c.api.putLight({ manual: { state, until: DURATIONS[dur].until() }, emoji: emoji, note: note.trim().slice(0, 60) || null, plan: raw?.plan });
      c.refresh();
      onClose();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup visible={visible} onClose={onClose} title={isMe ? 'Mein Status' : 'Ampel'}>
      {!isMe || c.mirror ? (
        <View style={{ gap: 10, alignItems: 'flex-start' }}>
          <Lamps state={cur?.state ?? null} size={22} />
          <Text style={styles.big}>
            {cur ? LAMP_LABEL[cur.state] : 'kein Status'} {raw?.emoji ?? ''}
          </Text>
          {raw?.note ? <Text style={styles.body}>{raw.note}</Text> : null}
          <Sub>{cur?.until ? `bis ${formatClock(cur.until, tz)} (Ortszeit dort)` : cur ? 'ohne Ende gesetzt' : ''}</Sub>
          <Sub style={{ color: C.fg3 }}>Der Wochenplan, nach dem die Ampel von selbst schaltet, kommt in einem der nächsten Schritte.</Sub>
        </View>
      ) : (
        <>
          <View style={styles.lampRow}>
            {(['free', 'busy', 'sleeping'] as const).map((s) => (
              <Pressable key={s} onPress={() => setState(s)} style={[styles.lampBtn, state === s && styles.lampBtnOn]}>
                <View style={[styles.lampBig, { backgroundColor: state === s ? LAMP[s] : C.lampOff, shadowColor: LAMP[s], shadowOpacity: state === s ? 0.9 : 0 }]} />
                <Text style={[styles.lampText, state === s && { color: C.fg }]}>{LAMP_LABEL[s]}</Text>
              </Pressable>
            ))}
          </View>
          <Label>Wie lange</Label>
          <View style={styles.wrap}>
            {DURATIONS.map((d, i) => (
              <Chip key={d.label} label={d.label} selected={dur === i} onPress={() => setDur(i)} />
            ))}
          </View>
          <Label>Zusatz</Label>
          <View style={styles.wrap}>
            {EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(emoji === e ? null : e)} />
            ))}
          </View>
          <TextInput value={note} onChangeText={setNote} placeholder="Kurze Notiz (optional)" placeholderTextColor={C.fg3} maxLength={60} style={styles.input} />
          <PillButton title={busy ? 'Setze …' : 'Status setzen'} kind="amber" onPress={save} disabled={busy} />
          <Sub style={{ color: C.fg3 }}>Schneller geht es direkt auf der Kachel: einmal tippen wechselt frei, busy und schläft.</Sub>
        </>
      )}
    </Popup>
  );
}

// ---------------------------------------------------------------------------------------------
// Post-its: lesen (Drüben) bzw. schreiben (Ich, Tastatur sofort offen)
// ---------------------------------------------------------------------------------------------

const COLORS: NoteColor[] = ['yellow', 'pink', 'green', 'blue'];

function NotesPopup({ c, visible, onClose }: P) {
  const icc = useIcc();
  const notes = useMemo(() => [...(c.view?.notes ?? [])].sort((a, b) => b.createdAt - a.createdAt), [c.view?.notes]);
  const isMe = c.mode === 'me';
  const [text, setText] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  const [busy, setBusy] = useState(false);
  const marked = useRef(new Set<string>());

  // Post-its des Partners gelten als gesehen, sobald das Pop-up sie zeigt.
  useEffect(() => {
    if (!visible || !sendsReceipts(c)) return;
    for (const n of notes) {
      if (!n.seenAt && !marked.current.has(n.id)) {
        marked.current.add(n.id);
        c.api.markNoteSeen(n.id).catch(() => marked.current.delete(n.id));
      }
    }
  }, [visible, notes, c]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await c.api.addNote({ text: text.trim().slice(0, 500), color, done: false });
      setText('');
      c.toast('Post-it angeheftet');
      c.refresh();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup visible={visible} onClose={onClose} title={icc ? 'Notiz' : 'Post-its'}>
      {isMe && !c.mirror ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Was willst du anheften?"
            placeholderTextColor={C.fg3}
            multiline
            autoFocus
            maxLength={500}
            style={[styles.noteInput, { borderLeftColor: NOTE_ACCENT[color] }]}
          />
          <View style={[styles.rowBetween, { gap: 8 }]}>
            <View style={styles.wrap}>
              {COLORS.map((col) => (
                <Pressable key={col} onPress={() => setColor(col)} style={[styles.swatch, { backgroundColor: NOTE_ACCENT[col] }, color === col && styles.swatchOn]} accessibilityLabel={`Farbe ${col}`} />
              ))}
            </View>
            <PillButton title={busy ? '…' : 'Anheften'} kind="amber" onPress={add} disabled={busy || !text.trim()} />
          </View>
          <Sub style={{ color: C.fg3 }}>Bleibt 24 Stunden, dann verschwindet es von selbst.</Sub>
        </View>
      ) : null}
      {notes.length === 0 ? <Sub style={{ textAlign: 'center', paddingVertical: 16 }}>{isMe ? 'Noch nichts angeheftet.' : 'Keine Post-its.'}</Sub> : null}
      <View style={styles.notesGrid}>
        {notes.map((n) => {
          const b = opened(n.body);
          if (icc)
            return (
              <LinearGradient key={n.id} colors={PLATE} locations={[0, 0.45, 0.75, 1]} style={styles.iccPlate}>
                <Stamped text={b ? b.text : '🔒'} size={17} />
                <View style={[styles.rowBetween, { marginTop: 14 }]}>
                  <Stamped text={`${remainingLabel(n.expiresAt, c.now).toUpperCase()}${isMe && n.seenAt ? ' · GELESEN' : ''}`} size={9} seed={3} />
                  {isMe && !c.mirror ? (
                    <Pressable onPress={() => c.api.deleteNote(n.id).then(c.refresh, (e) => c.toast(String(e)))} hitSlop={10}>
                      <Stamped text="✕" size={13} />
                    </Pressable>
                  ) : null}
                </View>
              </LinearGradient>
            );
          return (
            <View key={n.id} style={[styles.postit, { borderLeftColor: b ? NOTE_ACCENT[b.color] : C.fg3 }]}>
              <Text style={styles.postitText}>{b ? b.text : '🔒'}</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.postitFoot}>
                  {remainingLabel(n.expiresAt, c.now)}
                  {isMe && n.seenAt ? ' · 👀' : ''}
                </Text>
                {isMe && !c.mirror ? (
                  <Pressable onPress={() => c.api.deleteNote(n.id).then(c.refresh, (e) => c.toast(String(e)))} hitSlop={10}>
                    <Text style={styles.postitFoot}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Popup>
  );
}

// ---------------------------------------------------------------------------------------------
// Standort
// ---------------------------------------------------------------------------------------------

function MapPopup({ c, visible, onClose }: P) {
  const loc = opened(c.view?.location);
  const pos = loc && !loc.paused ? loc : null;
  const myLoc = opened(c.me?.location);
  const myPos = myLoc && !myLoc.paused ? myLoc : null;
  const isMe = c.mode === 'me';
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      c.toast(msg);
      c.refresh();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup visible={visible} onClose={onClose} title={isMe ? 'Mein Standort' : 'Standort'} wide>
      <View style={styles.mapBox}>{pos ? <MiniMap lat={pos.lat} lon={pos.lon} interactive /> : <Sub style={{ textAlign: 'center' }}>{loc?.paused ? 'Standort pausiert' : 'Noch kein Standort geteilt'}</Sub>}</View>
      {pos && myPos && !isMe && !c.mirror ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Led text={String(Math.round(distanceKm(pos, myPos)))} size={24} />
          <Text style={styles.body}>km entfernt</Text>
        </View>
      ) : null}
      <Sub>
        Auf etwa 1 km gerundet, verschlüsselt.
        {c.view?.locationUpdatedAt ? ` Zuletzt ${agoLabel(c.view.locationUpdatedAt, c.now)}.` : ''}
      </Sub>
      {isMe && !c.mirror ? (
        <View style={styles.wrap}>
          <PillButton title="Jetzt teilen" kind="amber" disabled={busy} onPress={() => run(() => shareLocationNow(c), 'Standort geteilt')} />
          <PillButton title="Pausieren" disabled={busy || !!loc?.paused} onPress={() => run(() => c.api.putLocation({ paused: true }), 'Standort pausiert')} />
        </View>
      ) : null}
    </Popup>
  );
}

// ---------------------------------------------------------------------------------------------
// Kalender: Tag (wischen wechselt), oben Woche/Monat. Termine folgen mit der Kalender-Anbindung.
// ---------------------------------------------------------------------------------------------

type CalMode = 'day' | 'week' | 'month';
const DAY = 86_400_000;

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function CalendarPopup({ c, visible, onClose }: P) {
  const [mode, setMode] = useState<CalMode>('day');
  const [day, setDay] = useState(startOfDay(Date.now()));
  useEffect(() => {
    if (visible) setDay(startOfDay(Date.now()));
  }, [visible]);

  const step = (dir: 1 | -1) =>
    setDay((d) => {
      const x = new Date(d);
      if (mode === 'day') x.setDate(x.getDate() + dir);
      else if (mode === 'week') x.setDate(x.getDate() + 7 * dir);
      else x.setMonth(x.getMonth() + dir);
      return startOfDay(x.getTime());
    });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -40) step(1);
          else if (g.dx > 40) step(-1);
        },
      }),
    [mode], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const title =
    mode === 'month'
      ? new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(day)
      : new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(day);

  return (
    <Popup visible={visible} onClose={onClose} title="Kalender" scroll={false}>
      <View style={styles.segment}>
        {(
          [
            ['day', 'Tag'],
            ['week', 'Woche'],
            ['month', 'Monat'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setMode(k)} style={[styles.segBtn, mode === k && styles.segOn]}>
            <Text style={[styles.segText, mode === k && { color: C.fg }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.rowBetween}>
        <Pressable onPress={() => step(-1)} hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.calTitle}>{title}</Text>
        <Pressable onPress={() => step(1)} hitSlop={12}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
      <View {...pan.panHandlers} style={{ minHeight: 220 }}>
        {mode === 'day' ? (
          <View style={{ gap: 6 }}>
            {[8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
              <View key={h} style={styles.hourRow}>
                <Text style={styles.hour}>{String(h).padStart(2, '0')}:00</Text>
                <View style={styles.hourLine} />
              </View>
            ))}
          </View>
        ) : mode === 'week' ? (
          <View style={{ gap: 6 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const monday = day - ((new Date(day).getDay() + 6) % 7) * DAY;
              const d = monday + i * DAY;
              return (
                <Pressable key={i} onPress={() => (setDay(d), setMode('day'))} style={styles.weekRow}>
                  <Text style={[styles.hour, startOfDay(Date.now()) === d && { color: C.amber }]}>
                    {new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d)}
                  </Text>
                  <View style={styles.hourLine} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <MonthGrid day={day} onPick={(d) => (setDay(d), setMode('day'))} />
        )}
        <Sub style={{ color: C.fg3, marginTop: 12 }}>Termine kommen mit der Kalender-Anbindung. Wischen wechselt {mode === 'day' ? 'den Tag' : mode === 'week' ? 'die Woche' : 'den Monat'}.</Sub>
      </View>
    </Popup>
  );
}

function MonthGrid({ day, onPick }: { day: number; onPick: (d: number) => void }) {
  const first = new Date(day);
  first.setDate(1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = startOfDay(Date.now());
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => startOfDay(new Date(first.getFullYear(), first.getMonth(), i + 1).getTime()))];
  return (
    <View>
      <View style={styles.monthRow}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <Text key={d} style={[styles.monthCell, styles.monthHead]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.monthRow}>
        {cells.map((d, i) =>
          d == null ? (
            <View key={i} style={styles.monthCellBox} />
          ) : (
            <Pressable key={i} onPress={() => onPick(d)} style={[styles.monthCellBox, d === today && styles.today]}>
              <Text style={[styles.monthCell, d === today && { color: '#1a1406' }]}>{new Date(d).getDate()}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Einstellungen (Zahnrad auf „Ich“): Name, Gerät, Entwickler-Vorschau
// ---------------------------------------------------------------------------------------------

export function SettingsPopup({
  c,
  visible,
  onClose,
  onLogout,
  mirror,
  onMirrorChange,
}: P & { onLogout: () => void; mirror: boolean; onMirrorChange: (on: boolean) => void }) {
  const profile = opened(c.me?.profile);
  const { skin, setSkin } = useSkin();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setName(profile?.name ?? '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      await c.api.putProfile({ name: name.trim().slice(0, 40), tz: c.myTz });
      c.toast('Gespeichert');
      c.refresh();
    } catch (e) {
      c.toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup visible={visible} onClose={onClose} title="Einstellungen">
      <Label>Dein Name</Label>
      <View style={[styles.rowBetween, { gap: 8 }]}>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={C.fg3} maxLength={40} style={[styles.input, { flex: 1 }]} />
        <PillButton title={busy ? '…' : 'Speichern'} kind="amber" onPress={save} disabled={busy || !name.trim()} />
      </View>
      <Sub>Zeitzone: {c.myTz}. Folgt automatisch dem iPhone, auch auf Reisen.</Sub>

      <Label style={{ marginTop: 8 }}>Design</Label>
      <View style={styles.wrap}>
        {SKINS.map((s) => (
          <Chip key={s.id} label={s.label} selected={skin === s.id} onPress={() => setSkin(s.id)} />
        ))}
      </View>
      <Sub>Gilt nur für dich auf diesem iPhone. Dein Freund sieht sein eigenes Design.</Sub>

      {__DEV__ ? (
        <>
          <Label style={{ marginTop: 8 }}>Entwicklung (nur in Expo Go)</Label>
          <Sub>Vorschau: Die Seite deines Freundes zeigt deine eigenen Inhalte so, wie dein Freund sie sieht. Es wird nichts als gesehen markiert.</Sub>
          <View style={styles.wrap}>
            <Chip label="Aus" selected={!mirror} onPress={() => onMirrorChange(false)} />
            <Chip label="Vorschau an" selected={mirror} onPress={() => onMirrorChange(true)} />
          </View>
        </>
      ) : null}

      <Label style={{ marginTop: 8 }}>Gerät</Label>
      <Sub>Inhalte sind Ende-zu-Ende verschlüsselt. Der Server sieht nur Zeitpunkte und Größen. Person {c.me?.person ?? '–'}.</Sub>
      <PillButton
        title="Abmelden"
        kind="danger"
        onPress={() =>
          Alert.alert('Abmelden?', 'Der Schlüssel wird von diesem iPhone gelöscht. Zum erneuten Koppeln brauchst du den Kopplungslink.', [
            { text: 'Abbrechen', style: 'cancel' },
            { text: 'Abmelden', style: 'destructive', onPress: onLogout },
          ])
        }
      />
    </Popup>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bigPhoto: { width: '100%', aspectRatio: 1.25, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)' },
  caption: { color: C.fg, fontSize: 16 },
  big: { fontFamily: F.display, fontSize: 24, color: C.fg },
  body: { color: C.fg, fontSize: 16 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, backgroundColor: C.glass, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.fg },
  lampRow: { flexDirection: 'row', gap: 8 },
  lampBtn: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: C.glass, borderWidth: 1, borderColor: 'transparent' },
  lampBtnOn: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: C.glass2 },
  lampBig: { width: 28, height: 28, borderRadius: 14, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  lampText: { fontFamily: F.display, fontSize: 12, color: C.fg2 },
  noteInput: { minHeight: 96, borderRadius: 12, padding: 12, borderLeftWidth: 3, backgroundColor: C.glass2, fontSize: 16, lineHeight: 22, color: C.fg, textAlignVertical: 'top' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: '#fff' },
  notesGrid: { gap: 8 },
  iccPlate: { borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#6c727b' },
  postit: { padding: 12, borderRadius: 12, borderLeftWidth: 3, backgroundColor: C.glass, gap: 6 },
  postitText: { fontSize: 16, lineHeight: 22, color: C.fg },
  postitFoot: { fontSize: 12, color: C.fg3 },
  mapBox: { height: 260, borderRadius: 14, overflow: 'hidden', backgroundColor: C.glass, justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: C.glass, borderRadius: 999, padding: 3, alignSelf: 'center' },
  segBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  segOn: { backgroundColor: C.glass2 },
  segText: { fontFamily: F.display, fontSize: 11, color: C.fg2 },
  arrow: { color: C.fg2, fontSize: 28, paddingHorizontal: 8 },
  calTitle: { fontFamily: F.display, fontSize: 13, color: C.fg, textAlign: 'center', flex: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 22 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 28 },
  hour: { color: C.fg3, fontSize: 12, width: 78 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  monthRow: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCellBox: { width: `${100 / 7}%`, aspectRatio: 1.2, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  monthCell: { color: C.fg, fontSize: 14, textAlign: 'center' },
  monthHead: { color: C.fg3, fontSize: 11, paddingVertical: 6, width: `${100 / 7}%` },
  today: { backgroundColor: C.amber },
});
