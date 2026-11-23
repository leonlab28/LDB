import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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

export function PhotoThumb({ load, id, hasThumb, seen, kept, onPress }: {
  load: PhotoLoader;
  id: string;
  hasThumb: boolean;
  seen: boolean;
  kept: boolean;
  onPress: () => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUri(null);
    setFailed(false);
    load(id, hasThumb ? 'thumb' : 'full')
      .then((u) => alive && setUri(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [load, id, hasThumb]);

  return (
    <Pressable onPress={onPress} style={styles.box}>
      {uri ? <Image source={{ uri }} style={styles.img} /> : failed ? <Text>🔒</Text> : <ActivityIndicator />}
      {!seen ? <View style={styles.dot} /> : null}
      {kept ? <Text style={styles.heart}>❤️</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#8882', alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%' },
  dot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9480F' },
  heart: { position: 'absolute', bottom: 4, right: 6, fontSize: 14 },
});
