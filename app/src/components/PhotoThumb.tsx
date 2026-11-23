import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Api } from '../lib/api';
import { b64 } from '../lib/bytes';

// Entschlüsselte Bilder nur im Arbeitsspeicher, nie auf der Platte.
const cache = new Map<string, string>();

export function dataUri(bytes: Uint8Array) {
  return `data:image/jpeg;base64,${b64.encode(bytes)}`;
}

export async function loadPartnerPhoto(api: Api, id: string, size: 'full' | 'thumb'): Promise<string> {
  const k = `${id}:${size}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const uri = dataUri(await api.partnerPhoto(id, size));
  cache.set(k, uri);
  return uri;
}

export type PhotoLoader = (id: string, size: 'full' | 'thumb') => Promise<string>;

/** Eigene Fotos laden, so wie der Partner sie sehen würde (für die Spiegel-Vorschau). */
export async function loadOwnPhoto(api: Api, id: string, size: 'full' | 'thumb'): Promise<string> {
  const hit = rememberedOwnPhoto(id, size);
  if (hit) return hit;
  const uri = dataUri(await api.ownPhoto(id, size));
  cache.set(`own:${id}:${size}`, uri);
  return uri;
}

/** Merkt sich ein eigenes, gerade hochgeladenes Foto für die Spiegel-Vorschau (nur Arbeitsspeicher, nur __DEV__). */
export function rememberOwnPhoto(id: string, size: 'full' | 'thumb', bytes: Uint8Array) {
  cache.set(`own:${id}:${size}`, dataUri(bytes));
}

export function rememberedOwnPhoto(id: string, size: 'full' | 'thumb'): string | null {
  return cache.get(`own:${id}:${size}`) ?? cache.get(`own:${id}:full`) ?? null;
}

/** Entschlüsseltes Foto, füllt den Container. Zeigt ein Schloss, wenn es sich nicht öffnen lässt. */
export function PhotoImage({
  load,
  id,
  size,
  style,
  contain = false,
}: {
  load: PhotoLoader;
  id: string;
  size: 'full' | 'thumb';
  style?: StyleProp<ViewStyle>;
  contain?: boolean;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUri(null);
    setFailed(false);
    load(id, size)
      .then((u) => alive && setUri(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [load, id, size]);

  return (
    <View style={[styles.box, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={contain ? 'contain' : 'cover'} />
      ) : failed ? (
        <Text style={{ fontSize: 20 }}>🔒</Text>
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
