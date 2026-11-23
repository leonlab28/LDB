import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, Muted } from '../components/ui';
import { ApiError, registerDevice } from '../lib/api';
import { parsePairingLink } from '../lib/crypto';
import { saveSession, type Session } from '../lib/session';
import { useTheme } from '../theme';

export function PairingScreen({ onPaired }: { onPaired: (s: Session) => void }) {
  const t = useTheme();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setError(null);
    setBusy(true);
    try {
      const parsed = parsePairingLink(link);
      const deviceKey = await registerDevice(parsed);
      onPaired(await saveSession({ server: parsed.server, person: parsed.person, deviceKey, secret: parsed.secret }));
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Kopplung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: t.text }]}>LDB</Text>
          <Muted>Einmal koppeln, danach bleibt dieses iPhone angemeldet.</Muted>
          <Card>
            <Body>Kopplungslink einfügen</Body>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="ldb://pair?server=…"
              placeholderTextColor={t.muted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
            {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
            <Button title="Koppeln" onPress={pair} busy={busy} disabled={!link.trim()} />
          </Card>
          <Muted>
            Der Link enthält den gemeinsamen Schlüssel. Er wird nur im Schlüsselbund dieses iPhones gespeichert und nie an den
            Server geschickt. Gib ihn nur über Signal oder einen Passwortmanager weiter.
          </Muted>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 16, paddingTop: 48 },
  title: { fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  input: { minHeight: 88, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, fontFamily: 'Menlo' },
});
