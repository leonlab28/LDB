import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
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
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { CloseIcon } from './Icons';
import { useIcc } from './skin';
import { C, F, R } from './tokens';

/** ICC-Skin: gebürstetes Alu (Rahmen der Kacheln, wie die Verkleidung im ICC). */
export const ALU = ['#aeb3bb', '#6b717a', '#8f959e', '#50565f', '#7f858e', '#b3b8bf'] as const;
const ALU_AT = [0, 0.18, 0.42, 0.58, 0.8, 1] as const;
/** ICC-Skin: glatte Alu-Platte (Notiz). */
export const PLATE = ['#dde1e6', '#c4c9d0', '#b3b9c1', '#a3a9b1'] as const;
/** ICC-Skin: einheitlicher Innenabstand aller Kacheln (ab Innenkante des Alu-Rahmens). */
export const ICC_PAD = 14;
/** ICC-Skin: Stärke des Alu-Rahmens der Kacheln. */
const ICC_RIM = 1.5;
export const ICC = { red: '#ff2d14', cyan: '#22c4ff', inner: '#0b0d13', ceiling: '#0d1016' } as const;

/** ICC-Decke: dunkle Lamellen, oben roter Schein der Neon-Uhr, unten ein Hauch Blau. */
function IccCeiling() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="slat" patternUnits="userSpaceOnUse" width={8} height={18}>
          <Rect width={8} height={18} fill="#0d1016" />
          <Rect y={15} width={8} height={1} fill="#181c25" />
          <Rect y={16} width={8} height={2} fill="#050608" />
        </Pattern>
        <RadialGradient id="glowTop" cx="50%" cy="10%" rx="70%" ry="30%">
          <Stop offset="0" stopColor="#ff280a" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#ff280a" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glowBottom" cx="50%" cy="100%" rx="60%" ry="30%">
          <Stop offset="0" stopColor="#0078ff" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#0078ff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#slat)" />
      <Rect width="100%" height="100%" fill="url(#glowTop)" />
      <Rect width="100%" height="100%" fill="url(#glowBottom)" />
    </Svg>
  );
}

/** Tiefes Indigo, wie Himmel nach Sonnenuntergang über dem Hafen. Liegt hinter der ganzen App. */
export function Backdrop({ children }: { children: ReactNode }) {
  const icc = useIcc();
  if (icc)
    return (
      <View style={{ flex: 1, backgroundColor: ICC.ceiling }}>
        <IccCeiling />
        {children}
      </View>
    );
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
  face = 'dark',
  contentStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Anordnung des Inhalts (flexDirection, justifyContent …). Im ICC-Skin liegt der Inhalt in einer inneren Fläche. */
  contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  padded?: boolean;
  label?: string;
  /** Nur ICC: 'plate' macht die ganze Kachel zur glatten Alu-Platte (Notiz). */
  face?: 'dark' | 'plate';
}) {
  const icc = useIcc();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const press = withOrigin(ref, onPress);
  const longPress = withOrigin(ref, onLongPress);
  if (icc)
    return (
      <Pressable
        ref={ref}
        onPress={press}
        onLongPress={longPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.iccTile, style, pressed && (onPress || onLongPress) ? { transform: [{ scale: 0.97 }] } : null]}
      >
        <LinearGradient colors={ALU} locations={ALU_AT} style={StyleSheet.absoluteFill} />
        {face === 'plate' ? (
          <LinearGradient colors={PLATE} locations={[0, 0.45, 0.75, 1]} style={[styles.iccInner, padded && styles.iccPadded, contentStyle]}>
            {children}
          </LinearGradient>
        ) : (
          <View style={[styles.iccInner, { backgroundColor: ICC.inner }, padded && styles.iccPadded, contentStyle]}>{children}</View>
        )}
      </Pressable>
    );
  return (
    <Pressable
      ref={ref}
      onPress={press}
      onLongPress={longPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, padded && styles.padded, contentStyle, pressed && (onPress || onLongPress) ? styles.pressed : null, style]}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Öffnen wie bei Apple: Das Pop-up wächst aus der angetippten Kachel heraus und schrumpft beim
// Schließen dorthin zurück. Die Kachel merkt sich beim Tippen ihre Position auf dem Bildschirm.
// ---------------------------------------------------------------------------------------------

type Rect4 = { x: number; y: number; w: number; h: number };
let lastOrigin: { rect: Rect4; at: number } | null = null;

/** Merkt sich die Position einer Kachel, bevor ihre Aktion ein Pop-up öffnet. */
type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

function withOrigin(ref: { current: Measurable | null }, fn?: () => void) {
  if (!fn) return undefined;
  return () => {
    const node = ref.current;
    if (!node) return fn();
    node.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) lastOrigin = { rect: { x, y, w, h }, at: Date.now() };
      fn();
    });
  };
}

/** Nur frische Positionen verwenden (sonst z. B. das Zahnrad: Pop-up blendet einfach weich ein). */
function takeOrigin(): Rect4 | null {
  const o = lastOrigin;
  lastOrigin = null;
  return o && Date.now() - o.at < 800 ? o.rect : null;
}

function useMorph(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  const p = useRef(new Animated.Value(0)).current;
  const origin = useRef<Rect4 | null>(null);
  const [card, setCard] = useState<Rect4 | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (visible) {
      origin.current = takeOrigin();
      started.current = false;
      setCard(null);
      p.setValue(0);
      setMounted(true);
    } else if (mounted) {
      Animated.timing(p, { toValue: 0, duration: 230, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCardLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setCard({ x, y, w: width, h: height });
    // Nur beim ersten Layout starten (die Tastatur verschiebt das Pop-up später noch einmal).
    if (!started.current) {
      started.current = true;
      Animated.spring(p, { toValue: 1, damping: 22, stiffness: 230, mass: 0.9, useNativeDriver: true }).start();
    }
  };

  const o = origin.current;
  let cardStyle: object;
  if (o && card) {
    const dx = o.x + o.w / 2 - (card.x + card.w / 2);
    const dy = o.y + o.h / 2 - (card.y + card.h / 2);
    cardStyle = {
      opacity: p.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
      transform: [
        { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
        { scaleX: p.interpolate({ inputRange: [0, 1], outputRange: [Math.max(0.05, o.w / card.w), 1] }) },
        { scaleY: p.interpolate({ inputRange: [0, 1], outputRange: [Math.max(0.05, o.h / card.h), 1] }) },
      ],
    };
  } else {
    cardStyle = {
      opacity: card ? p : 0,
      transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
    };
  }
  // Inhalt blendet erst auf, wenn die Form fast steht, damit er beim Wachsen nicht verzerrt wirkt.
  const contentStyle = { opacity: o ? p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] }) : 1 };
  return { mounted, p, cardStyle, contentStyle, onCardLayout };
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
  const icc = useIcc();
  const m = useMorph(visible);
  const w = Math.min(width * 0.9, wide ? 760 : 560);
  const maxH = height * (width > height ? 0.86 : 0.78);

  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.popBody} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.popBody, { flexShrink: 1 }]}>{children}</View>
  );

  return (
    <Modal visible={m.mounted} transparent animationType="none" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: m.p }]}>
        <BlurView intensity={icc ? 14 : 18} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: icc ? 'rgba(3,4,8,0.45)' : 'rgba(3,4,12,0.55)' }]} onPress={onClose} accessibilityLabel="Schließen" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.center} pointerEvents="box-none">
        {icc ? (
          <Animated.View onLayout={m.onCardLayout} style={[styles.iccPopup, { width: w, maxHeight: maxH }, m.cardStyle]}>
            <LinearGradient colors={ALU} locations={ALU_AT} style={StyleSheet.absoluteFill} />
            <View style={styles.iccPopInner}>
              <View style={styles.iccNeonBar} />
              <Animated.View style={[{ flexShrink: 1 }, m.contentStyle]}>
                <View style={styles.popHead}>
                  <Text style={styles.iccPopTitle} numberOfLines={1}>
                    {title.toUpperCase()}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {right}
                    <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Schließen" style={styles.iccClose}>
                      <LinearGradient colors={ALU} locations={ALU_AT} style={StyleSheet.absoluteFill} />
                      <CloseIcon size={12} color="#1a1c22" />
                    </Pressable>
                  </View>
                </View>
                {body}
              </Animated.View>
            </View>
          </Animated.View>
        ) : (
          <Animated.View onLayout={m.onCardLayout} style={[styles.popup, { width: w, maxHeight: maxH }, m.cardStyle]}>
            <Animated.View style={[{ flexShrink: 1 }, m.contentStyle]}>
              <View style={styles.popHead}>
                <Text style={styles.popTitle} numberOfLines={1}>
                  {title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {right}
                  <Pressable onPress={onClose} style={styles.close} hitSlop={10} accessibilityLabel="Schließen">
                    <CloseIcon size={12} color={C.fg2} />
                  </Pressable>
                </View>
              </View>
              {body}
            </Animated.View>
          </Animated.View>
        )}
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
  iccTile: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  iccInner: { position: 'absolute', left: ICC_RIM, top: ICC_RIM, right: ICC_RIM, bottom: ICC_RIM, borderRadius: 26 - ICC_RIM, overflow: 'hidden' },
  iccPadded: { padding: ICC_PAD },
  iccPopup: { borderRadius: 40, overflow: 'hidden', padding: 3, shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 30, shadowOffset: { width: 0, height: 20 } },
  iccPopInner: { borderRadius: 37, backgroundColor: '#0b0d12', overflow: 'hidden', flexShrink: 1, paddingTop: 10 },
  iccNeonBar: {
    height: 3,
    marginHorizontal: 30,
    borderRadius: 2,
    backgroundColor: '#ff3a1a',
    shadowColor: '#ff2d14',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  iccPopTitle: { fontFamily: F.display, fontSize: 13, letterSpacing: 3, color: '#e9ecf2', flexShrink: 1 },
  iccClose: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tile: {
    backgroundColor: C.glass,
    borderColor: C.hairline,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.tile,
    overflow: 'hidden',
  },
  padded: { padding: 12 },
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
