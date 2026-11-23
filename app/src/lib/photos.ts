import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { rememberOwnPhoto } from '../components/PhotoThumb';
import type { Api } from './api';
import { b64 } from './bytes';

async function jpegFrom(uri: string, longSide: number, current: { width: number; height: number }, compress: number) {
  const ctx = ImageManipulator.manipulate(uri);
  const long = Math.max(current.width, current.height);
  if (long === 0 || long > longSide) {
    ctx.resize(current.width >= current.height ? { width: longSide } : { height: longSide });
  }
  const ref = await ctx.renderAsync();
  // Neu kodieren entfernt auch EXIF-Daten (z. B. GPS-Position) aus dem Foto.
  const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Bild konnte nicht gelesen werden');
  return { bytes: b64.decode(out.base64), width: out.width, height: out.height };
}

// Qualität: Vollbild scharf auf Retina-Displays, Vorschau scharf genug für die große Foto-Kachel (bis ~3x).
// Server-Grenzen: Vollbild 4 MB, Vorschau 512 KB (jeweils plus Umschlag). Ist eine Stufe zu groß, wird stärker komprimiert.
const FULL = { side: 2560, steps: [0.88, 0.8, 0.7, 0.6], max: 3.8 * 1024 * 1024 };
const THUMB = { side: 1200, steps: [0.82, 0.72, 0.62, 0.5], max: 480 * 1024 };

async function encode(uri: string, current: { width: number; height: number }, spec: typeof FULL) {
  let out = await jpegFrom(uri, spec.side, current, spec.steps[0]);
  for (const q of spec.steps.slice(1)) {
    if (out.bytes.length <= spec.max) break;
    out = await jpegFrom(uri, spec.side, current, q);
  }
  return out;
}

/**
 * Öffnet direkt die Mehrfachauswahl (bis 10) und lädt nacheinander verschlüsselt hoch.
 * Gibt die Anzahl geteilter Fotos zurück; 0 bei Abbruch.
 */
export async function pickAndSharePhotos(
  api: Api,
  caption: string | null,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: 10,
  });
  if (res.canceled || !res.assets.length) return 0;
  const total = res.assets.length;
  let done = 0;
  onProgress(0, total);
  try {
    for (const asset of res.assets) {
      const full = await encode(asset.uri, asset, FULL);
      const thumb = await encode(asset.uri, asset, THUMB);
      const id = await api.uploadPhoto(full.bytes, thumb.bytes, { caption, width: full.width, height: full.height });
      rememberOwnPhoto(id, 'thumb', thumb.bytes);
      done++;
      onProgress(done, total);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(done > 0 ? `${done} von ${total} Fotos geteilt. Danach: ${msg}` : msg);
  }
  return done;
}
