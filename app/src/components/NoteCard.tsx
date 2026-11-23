import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NoteBody, Opened } from '../lib/types';
import { remainingLabel } from '../lib/time';
import { NOTE_COLORS } from '../theme';

export function NoteCard({
  body,
  expiresAt,
  seenAt,
  onPress,
  onLongPress,
}: {
  body: Opened<NoteBody>;
  expiresAt: number;
  seenAt: number | null;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const ok = body && body !== 'locked' ? body : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.note, { backgroundColor: ok ? NOTE_COLORS[ok.color] ?? NOTE_COLORS.yellow : '#DDD' }]}
    >
      <Text style={[styles.text, ok?.done && styles.done]}>{ok ? ok.text : '🔒 nicht lesbar'}</Text>
      <View style={styles.footer}>
        <Text style={styles.meta}>{remainingLabel(expiresAt)}</Text>
        {seenAt ? <Text style={styles.meta}>👀</Text> : null}
        {ok?.done ? <Text style={styles.meta}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { width: '47%', minHeight: 110, borderRadius: 6, padding: 12, justifyContent: 'space-between', transform: [{ rotate: '-0.6deg' }] },
  text: { fontSize: 16, color: '#2B2620' },
  done: { textDecorationLine: 'line-through', opacity: 0.6 },
  footer: { flexDirection: 'row', gap: 6, marginTop: 8 },
  meta: { fontSize: 12, color: '#5B544B' },
});
