import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteCard } from '../components/NoteCard';
import { loadOwnPhoto, loadPartnerPhoto, PhotoThumb } from '../components/PhotoThumb';
import { Body, Button, Card, Locked, Muted, Row, SectionTitle } from '../components/ui';
import type { Api } from '../lib/api';
import { distanceKm } from '../lib/geo';
import { currentLight, LIGHT_COLOR, LIGHT_LABEL } from '../lib/light';
import { agoLabel, dayEmoji, differenceLabel, formatClock, formatWeekday, hourIn, isValidTimezone } from '../lib/time';
import type { View as LdbView } from '../lib/types';
import { useTheme } from '../theme';

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function PartnerScreen({
  api,
  partner,
  me,
  myTz,
  refreshing,
  onRefresh,
  mirror = false,
}: {
  api: Api;
  partner: LdbView | null;
  me: LdbView | null;
  myTz: string;
  refreshing: boolean;
  onRefresh: () => void;
  /** Nur Entwicklung: zeigt die eigenen Inhalte so, wie der Partner sie sieht. Ohne Rückmeldungen an den Server. */
  mirror?: boolean;
}) {
  const t = useTheme();
  const now = useNow();
  const [openPhoto, setOpenPhoto] = useState<{ id: string; uri: string | null; kept: boolean } | null>(null);
  const markedNotes = useRef(new Set<string>());
  const loadPhoto = useCallback(
    (id: string, size: 'full' | 'thumb') => (mirror ? loadOwnPhoto(api, id, size) : loadPartnerPhoto(api, id, size)),
    [api, mirror],
  );

  // Post-its gelten als gesehen, sobald sie hier angezeigt werden.
  useEffect(() => {
    if (mirror) return;
    for (const n of partner?.notes ?? []) {
      if (!n.seenAt && !markedNotes.current.has(n.id)) {
        markedNotes.current.add(n.id);
        api.markNoteSeen(n.id).catch(() => markedNotes.current.delete(n.id));
      }
    }
  }, [api, mirror, partner?.notes]);

  if (!partner) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
        <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <Muted>Lade …</Muted>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const profile = partner.profile !== 'locked' ? partner.profile : null;
  const tz = profile && isValidTimezone(profile.tz) ? profile.tz : null;
  const light = partner.light !== 'locked' ? currentLight(partner.light, now) : null;
  const lightRaw = partner.light !== 'locked' ? partner.light : null;
  const theirLoc = partner.location && partner.location !== 'locked' && !partner.location.paused ? partner.location : null;
  const myLoc = me?.location && me.location !== 'locked' && !me.location.paused ? me.location : null;

  async function showPhoto(id: string, hasThumb: boolean, kept: boolean, seen: boolean) {
    setOpenPhoto({ id, uri: null, kept });
    if (!seen && !mirror) api.markPhoto(id, 'seen').catch(() => {});
    try {
      const uri = await loadPhoto(id, 'full');
      setOpenPhoto((cur) => (cur?.id === id ? { ...cur, uri } : cur));
    } catch {
      if (hasThumb) setOpenPhoto(null);
    }
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {mirror ? (
          <Text style={[styles.mirror, { color: t.accent, borderColor: t.accent }]}>Vorschau: So sieht dein Freund deine Seite</Text>
        ) : null}

        {/* Uhrzeit beim anderen */}
        <View style={styles.header}>
          <Muted>{partner.profile === 'locked' ? '🔒' : profile?.name || 'Partner'}</Muted>
          {tz ? (
            <>
              <Text style={[styles.clock, { color: t.text }]}>
                {formatClock(now, tz)} <Text style={styles.clockEmoji}>{dayEmoji(hourIn(tz, now))}</Text>
              </Text>
              <Muted>
                {formatWeekday(now, tz)} · {differenceLabel(myTz, tz, now)}
              </Muted>
            </>
          ) : (
            <Muted>Zeitzone noch nicht geteilt</Muted>
          )}
        </View>

        {/* Ampel */}
        <Card>
          {partner.light === 'locked' ? (
            <Locked />
          ) : (
            <>
              <Row>
                <View style={[styles.lamp, { backgroundColor: light ? LIGHT_COLOR[light.state] : t.border }]} />
                <Text style={[styles.lightLabel, { color: t.text }]}>
                  {light ? LIGHT_LABEL[light.state] : 'Kein Status'} {lightRaw?.emoji ?? ''}
                </Text>
              </Row>
              {lightRaw?.note ? <Body>{lightRaw.note}</Body> : null}
              {light?.until ? <Muted>bis {formatClock(light.until, tz ?? undefined)} (Ortszeit dort)</Muted> : null}
            </>
          )}
        </Card>

        {/* Entfernung */}
        <Card>
          {partner.location === 'locked' ? (
            <Locked />
          ) : partner.location?.paused ? (
            <Muted>📍 Standort pausiert</Muted>
          ) : theirLoc && myLoc ? (
            <Body>
              📍 {Math.round(distanceKm(theirLoc, myLoc)).toLocaleString('de-DE')} km entfernt
              {partner.locationUpdatedAt ? <Muted> · {agoLabel(partner.locationUpdatedAt, now)}</Muted> : null}
            </Body>
          ) : theirLoc ? (
            <Muted>📍 Teile deinen Standort, um die Entfernung zu sehen</Muted>
          ) : (
            <Muted>📍 Noch kein Standort geteilt</Muted>
          )}
        </Card>

        {/* Sprach-Slot */}
        {partner.voice ? (
          <Card>
            <Body>
              🎙 Sprachnachricht
              {partner.voice.meta && partner.voice.meta !== 'locked'
                ? ` · ${Math.round(partner.voice.meta.duration_ms / 1000)} s`
                : ''}
            </Body>
            <Muted>
              {agoLabel(partner.voice.recordedAt, now)} · Wiedergabe kommt im nächsten Schritt
            </Muted>
          </Card>
        ) : null}

        {/* Fotos */}
        <SectionTitle>Fotos (24 h)</SectionTitle>
        {partner.photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {partner.photos.map((p) => (
              <PhotoThumb
                key={p.id}
                load={loadPhoto}
                id={p.id}
                hasThumb={p.hasThumb}
                seen={!!p.seenAt}
                kept={!!p.keptAt}
                onPress={() => showPhoto(p.id, p.hasThumb, !!p.keptAt, !!p.seenAt)}
              />
            ))}
          </ScrollView>
        ) : (
          <Muted>Heute noch keine Fotos.</Muted>
        )}

        {/* Post-its */}
        <SectionTitle>Post-its</SectionTitle>
        {partner.notes.length ? (
          <View style={styles.notes}>
            {partner.notes.map((n) => (
              <NoteCard key={n.id} body={n.body} expiresAt={n.expiresAt} seenAt={null} />
            ))}
          </View>
        ) : (
          <Muted>Keine Post-its.</Muted>
        )}
      </ScrollView>

      <Modal visible={!!openPhoto} animationType="fade" transparent onRequestClose={() => setOpenPhoto(null)}>
        <Pressable style={styles.modal} onPress={() => setOpenPhoto(null)}>
          {openPhoto?.uri ? (
            <Image source={{ uri: openPhoto.uri }} style={styles.full} resizeMode="contain" />
          ) : (
            <Text style={{ color: '#fff' }}>Entschlüssele …</Text>
          )}
          {openPhoto ? (
            <View style={styles.modalBar}>
              {(() => {
                const meta = partner.photos.find((p) => p.id === openPhoto.id)?.meta;
                return meta && meta !== 'locked' && meta.caption ? <Text style={styles.caption}>{meta.caption}</Text> : null;
              })()}
              <Button
                title={openPhoto.kept ? '❤️ Behalten' : '🤍 Herz'}
                kind="secondary"
                onPress={() => {
                  if (openPhoto.kept || mirror) return;
                  api.markPhoto(openPhoto.id, 'keep').then(onRefresh).catch(() => {});
                  setOpenPhoto({ ...openPhoto, kept: true });
                }}
              />
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mirror: { borderWidth: 1, borderRadius: 12, padding: 8, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  wrap: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  clock: { fontSize: 64, fontWeight: '200', fontVariant: ['tabular-nums'] },
  clockEmoji: { fontSize: 36 },
  lamp: { width: 18, height: 18, borderRadius: 9 },
  lightLabel: { fontSize: 20, fontWeight: '600' },
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  modal: { flex: 1, backgroundColor: '#000E', alignItems: 'center', justifyContent: 'center', padding: 16 },
  full: { width: '100%', height: '75%' },
  modalBar: { position: 'absolute', bottom: 48, left: 16, right: 16, gap: 12, alignItems: 'center' },
  caption: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
