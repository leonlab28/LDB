import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, F } from './tokens';

/**
 * LED-Segmentanzeige (DSEG7). Unter den leuchtenden Ziffern liegen die "Geister-Segmente" (8),
 * wie bei einem echten Display. `text` darf Ziffern, ":" und "-" enthalten.
 */
export function Led({
  text,
  size,
  color = C.led,
  dim = false,
  style,
}: {
  text: string;
  size: number;
  color?: string;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ghost = text.replace(/[0-9-]/g, '8');
  return (
    <View style={style} accessibilityLabel={text} accessible>
      <Text style={[styles.base, { fontSize: size, color: C.ledGhost }]}>{ghost}</Text>
      <Text
        style={[
          styles.base,
          styles.lit,
          { fontSize: size, color, opacity: dim ? 0.5 : 1, textShadowColor: color === C.led ? 'rgba(255,255,255,0.3)' : color },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/** Geschätzte Breite eines LED-Texts in Punkten, um die Schriftgröße an den Platz anzupassen. */
export function ledWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += ch === ':' || ch === '.' ? 0.3 : 0.86;
  return w * size;
}

const styles = StyleSheet.create({
  base: { fontFamily: F.led, includeFontPadding: false },
  lit: { position: 'absolute', left: 0, top: 0, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
});
