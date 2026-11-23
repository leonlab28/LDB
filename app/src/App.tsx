import * as Localization from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Api, ApiError } from './lib/api';
import { clearSession, loadSession, type Session } from './lib/session';
import type { View as LdbView } from './lib/types';
import { MeScreen } from './screens/MeScreen';
import { PairingScreen } from './screens/PairingScreen';
import { PartnerScreen } from './screens/PartnerScreen';
import { useTheme } from './theme';

const POLL_MS = 60_000;

function deviceTimezone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    loadSession().then(setSession, () => setSession(null));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {session === undefined ? null : session ? (
        <Main session={session} onLogout={() => clearSession().then(() => setSession(null))} />
      ) : (
        <PairingScreen onPaired={setSession} />
      )}
    </SafeAreaProvider>
  );
}

function Main({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const api = useMemo(() => new Api(session), [session]);
  const [tab, setTab] = useState<'partner' | 'me'>('partner');
  const [me, setMe] = useState<LdbView | null>(null);
  const [partner, setPartner] = useState<LdbView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nur Entwicklung: „Drüben“ zeigt die eigenen Inhalte so, wie der Partner sie sieht.
  const [mirror, setMirror] = useState(false);
  const mirrorOn = __DEV__ && mirror;
  const myTz = deviceTimezone();
  const tzSynced = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
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
    } finally {
      setRefreshing(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {error ? (
        <Text style={[styles.error, { paddingTop: insets.top + 8, backgroundColor: t.danger }]} onPress={refresh}>
          {error}
        </Text>
      ) : null}
      <View style={{ flex: 1 }}>
        {tab === 'partner' ? (
          <PartnerScreen
            api={api}
            partner={mirrorOn ? me : partner}
            me={me}
            myTz={myTz}
            refreshing={refreshing}
            onRefresh={refresh}
            mirror={mirrorOn}
          />
        ) : (
          <MeScreen
            api={api}
            me={me}
            myTz={myTz}
            refreshing={refreshing}
            onRefresh={refresh}
            onLogout={onLogout}
            mirror={mirrorOn}
            onMirrorChange={(on) => {
              setMirror(on);
              if (on) setTab('partner');
            }}
          />
        )}
      </View>
      <View style={[styles.tabs, { paddingBottom: insets.bottom || 12, borderColor: t.border, backgroundColor: t.card }]}>
        {(
          [
            ['partner', 'Drüben'],
            ['me', 'Ich'],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={{ color: tab === key ? t.accent : t.muted, fontSize: 16, fontWeight: tab === key ? '700' : '500' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: '#fff', paddingHorizontal: 16, paddingBottom: 8, fontSize: 14 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  tab: { flex: 1, alignItems: 'center', minHeight: 32, justifyContent: 'center' },
});
