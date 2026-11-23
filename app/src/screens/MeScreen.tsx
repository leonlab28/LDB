import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoLocation from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteCard } from '../components/NoteCard';
import { Body, Button, Card, Chip, Muted, Row, SectionTitle } from '../components/ui';
import type { Api } from '../lib/api';
import { b64 } from '../lib/bytes';
import { roundCoord } from '../lib/geo';
import { currentLight, LIGHT_COLOR, LIGHT_LABEL, nextLocalTime } from '../lib/light';
import { agoLabel, formatClock, remainingLabel } from '../lib/time';
import type { Light, LightState, NoteColor, View as LdbView } from '../lib/types';
import { NOTE_COLORS, useTheme } from '../theme';

const DURATIONS = [
  { label: '1 Std.', until: () => Date.now() + 3600_000 },
  { label: '3 Std.', until: () => Date.now() + 3 * 3600_000 },
  { label: 'bis 8 Uhr', until: () => nextLocalTime(8) },
  { label: 'offen', until: () => null },
] as const;

async function jpegFrom(uri: string, longSide: number, current: { width: number; height: number }, compress: number) {
  const ctx = ImageManipulator.manipulate(uri);
  const long = Math.max(current.width, current.height);
  if (long === 0 || long > longSide) {
    ctx.resize(current.width >= current.height ? { width: longSide } : { height: longSide });
  }
  const ref = await ctx.renderAsync();
  // Neu kodieren entfernt auch EXIF-Daten (z. B. GPS-Position) aus dem Foto.
  const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Bild konnte nicht gelesen werden');
  return { bytes: b64.decode(out.base64), width: out.width, height: out.height };
}

export function MeScreen({
  api,
  me,
  myTz,
  refreshing,
  onRefresh,
  onLogout,
}: {
  api: Api;
  me: LdbView | null;
  myTz: string;
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const t = useTheme();
  const profile = me?.profile && me.profile !== 'locked' ? me.profile : null;
  const savedLight = me?.light && me.light !== 'locked' ? me.light : null;

  const [name, setName] = useState('');
  const [lightState, setLightState] = useState<LightState | null>(null);
  const [duration, setDuration] = useState(0);
  const [emoji, setEmoji] = useState('');
  const [lightNote, setLightNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Formular mit dem gespeicherten Stand füllen, sobald er geladen ist.
  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);
  useEffect(() => {
    if (!savedLight) return;
    setLightState(currentLight(savedLight)?.state ?? null);
    setEmoji(savedLight.emoji ?? '');
    setLightNote(savedLight.note ?? '');
  }, [savedLight?.emoji, savedLight?.note, savedLight?.manual?.state, savedLight?.manual?.until]);

  async function run(tag: string, fn: () => Promise<unknown>) {
    setBusy(tag);
    try {
      await fn();
      onRefresh();
    } catch (e) {
      Alert.alert('Hat nicht geklappt', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const saveProfile = () => run('profile', () => api.putProfile({ name: name.trim().slice(0, 40), tz: myTz }));

  const saveLight = () =>
    run('light', () => {
      const v: Light = {
        manual: lightState ? { state: lightState, until: DURATIONS[duration].until() } : null,
        emoji: emoji.trim() || null,
        note: lightNote.trim().slice(0, 80) || null,
        plan: savedLight?.plan,
      };
      return api.putLight(v);
    });

  const shareLocation = () =>
    run('location', async () => {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Standortzugriff ist in den Einstellungen deaktiviert.');
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      await api.putLocation({ lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) });
    });

  const pauseLocation = () => run('location', () => api.putLocation({ paused: true }));

  const addNote = () =>
    run('note', async () => {
      await api.addNote({ text: noteText.trim().slice(0, 500), color: noteColor, done: false });
      setNoteText('');
    });

  const sharePhoto = () =>
    run('photo', async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets.length) return;
      const asset = res.assets[0];
      const full = await jpegFrom(asset.uri, 2048, asset, 0.8);
      const thumb = await jpegFrom(asset.uri, 360, asset, 0.6);
      await api.uploadPhoto(full.bytes, thumb.bytes, { caption: caption.trim().slice(0, 80) || null, width: full.width, height: full.height });
      setCaption('');
    });

  const logout = () =>
    Alert.alert('Abmelden?', 'Der Schlüssel wird von diesem iPhone gelöscht. Zum erneuten Koppeln brauchst du den Kopplungslink.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Abmelden', style: 'destructive', onPress: onLogout },
    ]);

  const active = currentLight(savedLight);
  const loc = me?.location && me.location !== 'locked' ? me.location : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Profil */}
          <SectionTitle>Ich</SectionTitle>
          <Card>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Dein Name"
              placeholderTextColor={t.muted}
              maxLength={40}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
            <Muted>Zeitzone: {myTz} (folgt automatisch dem iPhone)</Muted>
            <Button title="Speichern" kind="secondary" onPress={saveProfile} busy={busy === 'profile'} disabled={!name.trim()} />
          </Card>

          {/* Ampel */}
          <SectionTitle>Ampel</SectionTitle>
          <Card>
            <Muted>
              Gerade: {active ? `${LIGHT_LABEL[active.state]}${active.until ? ` bis ${formatClock(active.until)}` : ''}` : 'kein Status'}
            </Muted>
            <Row>
              {(['free', 'busy', 'sleeping'] as const).map((s) => (
                <Chip key={s} label={LIGHT_LABEL[s]} color={LIGHT_COLOR[s]} selected={lightState === s} onPress={() => setLightState(lightState === s ? null : s)} />
              ))}
            </Row>
            {lightState ? (
              <Row>
                {DURATIONS.map((d, i) => (
                  <Chip key={d.label} label={d.label} selected={duration === i} onPress={() => setDuration(i)} />
                ))}
              </Row>
            ) : null}
            <Row>
              <TextInput
                value={emoji}
                onChangeText={(v) => setEmoji([...v].slice(0, 2).join(''))}
                placeholder="🙂"
                placeholderTextColor={t.muted}
                style={[styles.input, styles.emoji, { color: t.text, borderColor: t.border }]}
              />
              <TextInput
                value={lightNote}
                onChangeText={setLightNote}
                placeholder="Kurze Notiz (optional)"
                placeholderTextColor={t.muted}
                maxLength={80}
                style={[styles.input, { flex: 1, color: t.text, borderColor: t.border }]}
              />
            </Row>
            <Button title="Ampel setzen" onPress={saveLight} busy={busy === 'light'} />
          </Card>

          {/* Standort */}
          <SectionTitle>Standort</SectionTitle>
          <Card>
            <Muted>
              {loc
                ? loc.paused
                  ? 'Pausiert. Es wird kein Ort geteilt.'
                  : `Geteilt (auf ~1 km gerundet)${me?.locationUpdatedAt ? ' · ' + agoLabel(me.locationUpdatedAt) : ''}`
                : 'Noch nicht geteilt.'}
            </Muted>
            <Row>
              <Button title="Jetzt teilen" kind="secondary" onPress={shareLocation} busy={busy === 'location'} />
              <Button title="Pausieren" kind="secondary" onPress={pauseLocation} disabled={!!loc?.paused} />
            </Row>
          </Card>

          {/* Post-its */}
          <SectionTitle>Meine Post-its (24 h)</SectionTitle>
          <Card>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Neues Post-it"
              placeholderTextColor={t.muted}
              maxLength={500}
              multiline
              style={[styles.input, { minHeight: 64, color: t.text, borderColor: t.border }]}
            />
            <Row>
              {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                <Chip key={c} label="  " color={NOTE_COLORS[c]} selected={noteColor === c} onPress={() => setNoteColor(c)} />
              ))}
              <View style={{ flex: 1 }} />
              <Button title="Anheften" onPress={addNote} busy={busy === 'note'} disabled={!noteText.trim()} />
            </Row>
          </Card>
          {me?.notes.length ? (
            <>
              <Muted>Tippen: erledigt umschalten · Lange drücken: löschen</Muted>
              <View style={styles.notes}>
                {me.notes.map((n) => (
                  <NoteCard
                    key={n.id}
                    body={n.body}
                    expiresAt={n.expiresAt}
                    seenAt={n.seenAt}
                    onPress={() => {
                      if (!n.body || n.body === 'locked') return;
                      const body = n.body;
                      run('note-' + n.id, () => api.updateNote(n.id, { ...body, done: !body.done }, false));
                    }}
                    onLongPress={() =>
                      Alert.alert('Post-it löschen?', undefined, [
                        { text: 'Abbrechen', style: 'cancel' },
                        { text: 'Löschen', style: 'destructive', onPress: () => run('note-' + n.id, () => api.deleteNote(n.id)) },
                      ])
                    }
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Fotos */}
          <SectionTitle>Meine Fotos (24 h, max. 30/Tag)</SectionTitle>
          <Card>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Bildunterschrift (optional)"
              placeholderTextColor={t.muted}
              maxLength={80}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
            <Button title="Foto auswählen und teilen" onPress={sharePhoto} busy={busy === 'photo'} />
            {me?.photos.map((p) => (
              <Row key={p.id} style={styles.photoRow}>
                <Body style={{ flex: 1 }}>
                  📷 {formatClock(p.createdAt)}
                  {p.meta && p.meta !== 'locked' && p.meta.caption ? ` · ${p.meta.caption}` : ''}
                </Body>
                <Muted>
                  {p.seenAt ? '👀 ' : ''}
                  {p.keptAt ? '❤️ ' : ''}
                  {remainingLabel(p.expiresAt)}
                </Muted>
                <Button title="✕" kind="danger" onPress={() => run('photo-' + p.id, () => api.deletePhoto(p.id))} />
              </Row>
            ))}
          </Card>

          {/* Gerät */}
          <SectionTitle>Gerät</SectionTitle>
          <Card>
            <Muted>Inhalte sind Ende-zu-Ende verschlüsselt. Der Server sieht nur Zeitpunkte und Größen.</Muted>
            <Button title="Abmelden" kind="danger" onPress={logout} />
          </Card>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 12 }}>Person {me?.person ?? '–'}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 48 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  emoji: { width: 56, textAlign: 'center' },
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  photoRow: { flexWrap: 'nowrap' },
});
