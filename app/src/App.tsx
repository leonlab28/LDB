// Nur die benötigten Schnitte laden (der Paket-Index würde alle Gewichte mitbündeln).
import { Caveat_700Bold } from '@expo-google-fonts/caveat/700Bold';
import { Michroma_400Regular } from '@expo-google-fonts/michroma/400Regular';
import { useFonts } from 'expo-font';
import * as Localization from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadOwnPhoto, loadPartnerPhoto } from './components/PhotoThumb';
import type { DashCtx, Mode, PopupKind } from './dashboard/context';
import { Dashboard } from './dashboard/Dashboard';
import { Popups, SettingsPopup } from './dashboard/popups';
import { Backdrop } from './design/Glass';
import { C, F } from './design/tokens';
import { Api, ApiError } from './lib/api';
import { clearSession, loadSession, type Session } from './lib/session';
import type { View as LdbView } from './lib/types';
import { PairingScreen } from './screens/PairingScreen';

const POLL_MS = 60_000;

function deviceTimezone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [fontsLoaded] = useFonts({
    Michroma: Michroma_400Regular,
    Caveat: Caveat_700Bold,
    DSEG7: require('../assets/fonts/DSEG7Classic-Bold.ttf'),
  });

  useEffect(() => {
    loadSession().then(setSession, () => setSession(null));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Backdrop>
        {session === undefined || !fontsLoaded ? null : session ? (
          <Main session={session} onLogout={() => clearSession().then(() => setSession(null))} />
        ) : (
          <PairingScreen onPaired={setSession} />
        )}
      </Backdrop>
    </SafeAreaProvider>
  );
}

function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Main({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  const api = useMemo(() => new Api(session), [session]);
  const now = useNow();
  const [mode, setMode] = useState<Mode>('partner');
  const [me, setMe] = useState<LdbView | null>(null);
  const [partner, setPartner] = useState<LdbView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupKind | null>(null);
  // Nur Entwicklung: „Drüben“ zeigt die eigenen Inhalte so, wie der Partner sie sieht.
  const [mirrorState, setMirror] = useState(false);
  const mirror = __DEV__ && mirrorState;
  const myTz = deviceTimezone();
  const tzSynced = useRef(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toast = useCallback(
    (msg: string) => {
      setToastMsg(msg);
      toastAnim.stopAnimation();
      Animated.sequence([
        Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    },
    [toastAnim],
  );

  const refresh = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([api.view('me'), api.view('partner')]);
      setMe(m);
      setPartner(p);
      setError(null);

      // Zeitzone folgt automatisch dem iPhone (z. B. auf Reisen).
      if (!tzSynced.current && m.profile !== 'locked') {
        tzSynced.current = true;
        if (m.profile?.tz !== myTz) {
          await api.putProfile({ name: m.profile?.name ?? '', tz: myTz });
          setMe(await api.view('me'));
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Dieses iPhone ist beim Server nicht mehr bekannt. Bitte abmelden und neu koppeln.');
      } else {
        setError(e instanceof Error ? e.message : 'Fehler beim Laden');
      }
    }
  }, [api, myTz]);

  // Laden beim Start, beim Zurückkehren in die App und jede Minute, solange sie offen ist.
  useEffect(() => {
    refresh();
    let timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      clearInterval(timer);
      if (s === 'active') {
        refresh();
        timer = setInterval(refresh, POLL_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const showOwn = mode === 'me' || mirror;
  const loadPhoto = useCallback(
    (id: string, size: 'full' | 'thumb') => (showOwn ? loadOwnPhoto(api, id, size) : loadPartnerPhoto(api, id, size)),
    [api, showOwn],
  );

  const ctx: DashCtx = {
    api,
    mode,
    view: mode === 'me' ? me : mirror ? me : partner,
    me,
    myTz,
    now,
    mirror: mode === 'partner' && mirror,
    loadPhoto,
    refresh,
    toast,
    open: setPopup,
  };

  const corner = (
    <View style={styles.corner}>
      {mode === 'me' ? (
        <Pressable onPress={() => setPopup('settings')} hitSlop={8} style={styles.gear} accessibilityLabel="Einstellungen">
          <Text style={{ color: C.fg2, fontSize: 15 }}>⚙︎</Text>
        </Pressable>
      ) : null}
      <View style={styles.switch}>
        {(
          [
            ['partner', 'Drüben'],
            ['me', 'Ich'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setMode(k)} style={[styles.switchBtn, mode === k && styles.switchOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === k }}>
            <Text style={[styles.switchText, mode === k && { color: C.fg }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 10), paddingLeft: insets.left + 14, paddingRight: insets.right + 14 }}>
      {error ? (
        <Text style={styles.error} onPress={refresh}>
          {error}
        </Text>
      ) : null}
      {mirror && mode === 'partner' ? <Text style={styles.mirror}>Vorschau: So sieht dein Freund deine Seite</Text> : null}
      <Dashboard c={ctx} corner={corner} />
      <Popups
        c={ctx}
        which={popup}
        onClose={() => setPopup(null)}
        settings={
          <SettingsPopup
            c={ctx}
            visible={popup === 'settings'}
            onClose={() => setPopup(null)}
            onLogout={onLogout}
            mirror={mirror}
            onMirrorChange={(on) => {
              setMirror(on);
              setPopup(null);
              if (on) setMode('partner');
            }}
          />
        }
      />
      <Animated.View pointerEvents="none" style={[styles.toast, { bottom: Math.max(insets.bottom, 10) + 20, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: '#fff', backgroundColor: 'rgba(255,59,48,0.85)', padding: 8, borderRadius: 10, marginBottom: 6, fontSize: 13, overflow: 'hidden' },
  mirror: { color: C.amber, borderColor: C.amber, borderWidth: 1, borderRadius: 10, padding: 5, textAlign: 'center', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  corner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gear: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.glass2, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', backgroundColor: C.glass, borderRadius: 999, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline },
  switchBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  switchOn: { backgroundColor: C.glass2 },
  switchText: { fontFamily: F.display, fontSize: 10.5, color: C.fg2 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(238,240,255,0.95)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  toastText: { color: C.space2, fontWeight: '600', fontSize: 14 },
});
