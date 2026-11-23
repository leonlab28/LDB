import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { C, F, R } from './tokens';

/** Tiefes Indigo, wie Himmel nach Sonnenuntergang über dem Hafen. Liegt hinter der ganzen App. */
export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[C.space1, C.space2, C.space3]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      {children}
    </LinearGradient>
  );
}

/** Glas-Kachel. Ganze Kachel ist die Tippfläche. */
export function Tile({
  children,
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  padded = true,
  label,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  padded?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, padded && styles.padded, pressed && (onPress || onLongPress) ? styles.pressed : null, style]}
    >
      {children}
    </Pressable>
  );
}

/** Pop-up über der App. Rundherum bleibt der Hintergrund sichtbar, es wirkt nie wie eine neue Seite. */
export function Popup({
  visible,
  onClose,
  title,
  right,
  children,
  scroll = true,
  wide = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  wide?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const w = Math.min(width * 0.9, wide ? 760 : 560);
  const maxH = height * (width > height ? 0.86 : 0.78);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,4,12,0.55)' }]} onPress={onClose} accessibilityLabel="Schließen" />
      <KeyboardAvoidingView behavior="padding" style={styles.center} pointerEvents="box-none">
        <View style={[styles.popup, { width: w, maxHeight: maxH }]}>
          <View style={styles.popHead}>
            <Text style={styles.popTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {right}
              <Pressable onPress={onClose} style={styles.close} hitSlop={10} accessibilityLabel="Schließen">
                <Text style={{ color: C.fg2, fontSize: 14 }}>✕</Text>
              </Pressable>
            </View>
          </View>
          {scroll ? (
            <ScrollView contentContainerStyle={styles.popBody} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.popBody, { flexShrink: 1 }]}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.label, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function Sub({ children, style, lines = 1 }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) {
  return (
    <Text style={[styles.sub, style]} numberOfLines={lines}>
      {children}
    </Text>
  );
}

export function PillButton({
  title,
  onPress,
  kind = 'ghost',
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: 'ghost' | 'amber' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        kind === 'amber' && { backgroundColor: C.amber, borderColor: C.amber },
        kind === 'danger' && { borderColor: 'rgba(255,123,114,0.5)' },
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[styles.pillText, kind === 'amber' && { color: '#1a1406' }, kind === 'danger' && { color: '#ff7b72' }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { borderColor: color ?? C.amber, backgroundColor: C.glass2 }]}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && { color: C.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: C.glass,
    borderColor: C.hairline,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.tile,
    overflow: 'hidden',
  },
  padded: { padding: 14 },
  pressed: { backgroundColor: C.glass2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  popup: {
    backgroundColor: C.panel,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  popHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, gap: 12 },
  popTitle: { fontFamily: F.display, fontSize: 16, color: C.fg, flexShrink: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.glass2, alignItems: 'center', justifyContent: 'center' },
  popBody: { paddingHorizontal: 18, paddingBottom: 20, paddingTop: 4, gap: 12 },
  label: { fontFamily: F.display, fontSize: 10.5, letterSpacing: 0.3, color: C.fg2 },
  sub: { fontSize: 13, color: C.fg2 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    backgroundColor: C.glass,
  },
  pillText: { color: C.fg, fontWeight: '600', fontSize: 15 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: C.glass,
  },
  chipText: { color: C.fg2, fontSize: 14 },
});
