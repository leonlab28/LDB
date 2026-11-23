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

export function PhotoThumb({ api, id, hasThumb, seen, kept, onPress }: {
  api: Api;
  id: string;
  hasThumb: boolean;
  seen: boolean;
  kept: boolean;
  onPress: () => void;
}) {
  const [uri, setUri] = useState<string | null>(cache.get(`${id}:thumb`) ?? cache.get(`${id}:full`) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (uri) return;
    let alive = true;
    loadPartnerPhoto(api, id, hasThumb ? 'thumb' : 'full')
      .then((u) => alive && setUri(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [api, id, hasThumb, uri]);

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
