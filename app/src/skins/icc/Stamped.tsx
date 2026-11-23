import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const STAMP_FONT = 'CourierPrimeBold';

/** Kleiner, fester Zufall pro Text: dieselbe Notiz sieht bei jedem Öffnen gleich aus. */
function rng(text: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (const c of text) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  let s = h >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0;
    return (((s ^ (s >>> 7)) >>> 0) % 10000) / 10000;
  };
}

const graphemes = (t: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? [...new Seg('de', { granularity: 'grapheme' }).segment(t)].map((x) => x.segment) : [...t];
};
// Ohne Unicode-Property-Regex (nicht in jeder JS-Engine): grob über Codepunkte
const isEmoji = (g: string) => {
  if (/^[♥★✓☆✕]$/.test(g)) return false;
  const cp = g.codePointAt(0) ?? 0;
  return cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || g.includes('\ufe0f');
};

/**
 * Schreibmaschinen-Buchstaben, in eine Alu-Platte eingeschlagen. Jeder Buchstabe besteht aus drei Lagen:
 * eine helle Lichtkante knapp darunter (die untere Kante der Vertiefung fängt Licht), die dunkle Vertiefung
 * und ein feiner Schatten oben. Jeder Anschlag ist etwas anders: Tiefe, Neigung, Grundlinie.
 * Emojis (aus dem anderen Skin) erscheinen einfarbig, wie mit einem Bildstempel eingeschlagen.
 */
export function Stamped({
  text,
  size,
  lineHeight = 1.38,
  maxChars,
  seed = 0,
  style,
}: {
  text: string;
  size: number;
  lineHeight?: number;
  maxChars?: number;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const r = rng(text, seed);
  let t = text.replace(/\s+/g, ' ').trim();
  if (maxChars && t.length > maxChars) t = t.slice(0, maxChars - 1).trimEnd() + '…';
  const words = t.split(' ');
  const lh = size * lineHeight;
  return (
    <View style={[styles.wrap, style]}>
      {words.map((w, wi) => (
        <View key={wi} style={[styles.word, { height: lh, marginRight: size * 0.6 }]}>
          {graphemes(w).map((g, gi) => {
            const d = 0.72 + r() * 0.28;
            const rot = (r() - 0.5) * 2.2;
            const dy = (r() - 0.5) * 1.0;
            const emoji = isEmoji(g);
            const base = { fontFamily: STAMP_FONT, fontSize: size, lineHeight: lh, includeFontPadding: false } as const;
            return (
              <View key={gi} style={{ transform: [{ translateY: dy }, { rotate: `${rot.toFixed(2)}deg` }] }}>
                {emoji ? null : <Text style={[base, styles.abs, { top: size * 0.05, color: `rgba(255,255,255,${(0.75 * d).toFixed(2)})` }]}>{g}</Text>}
                <Text
                  style={[
                    base,
                    emoji
                      ? { color: '#6d737c', opacity: 0.55 }
                      : {
                          color: `rgba(26,29,34,${(0.62 + 0.3 * d).toFixed(2)})`,
                          textShadowColor: `rgba(0,0,0,${(0.35 * d).toFixed(2)})`,
                          textShadowOffset: { width: 0, height: -0.6 },
                          textShadowRadius: 0.6,
                        },
                  ]}
                >
                  {g}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  word: { flexDirection: 'row' },
  abs: { position: 'absolute', left: 0 },
});
