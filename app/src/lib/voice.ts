// Sprach-Slot: Aufnehmen (gedrückt halten), verschlüsselt hochladen, Nachricht des Partners abspielen.
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useRef, useState } from 'react';
import type { Api } from './api';

const MIN_MS = 700;
const MAX_MS = 3 * 60_000;

export type RecState = 'idle' | 'recording' | 'sending';

/** Gedrückt halten nimmt auf, loslassen schickt ab. */
export function useHoldToRecord(api: Api, tz: string, onSent: () => void, onError: (msg: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<RecState>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const holding = useRef(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    if (state !== 'idle') return;
    holding.current = true;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      holding.current = false;
      onError('Mikrofonzugriff ist in den Einstellungen deaktiviert.');
      return;
    }
    // Losgelassen, während die Erlaubnis-Abfrage offen war: nicht aufnehmen.
    if (!holding.current) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStartedAt(Date.now());
    setState('recording');
    maxTimer.current = setTimeout(() => stop(), MAX_MS);
  }

  async function stop() {
    holding.current = false;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (state !== 'recording' && !recorder.isRecording) return;
    const began = startedAt ?? Date.now();
    const durationMs = Date.now() - began;
    setStartedAt(null);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (durationMs < MIN_MS || !recorder.uri) {
        setState('idle');
        onError('Zum Aufnehmen gedrückt halten.');
        return;
      }
      setState('sending');
      const file = new File(recorder.uri);
      const bytes = await file.bytes();
      await api.uploadVoice(bytes, { duration_ms: durationMs, waveform: null, tz });
      try {
        file.delete();
      } catch {}
      onSent();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setState('idle');
    }
  }

  return { state, startedAt, start, stop };
}

let current: { player: AudioPlayer; file: File } | null = null;

export function stopVoice() {
  if (!current) return;
  try {
    current.player.remove();
  } catch {}
  try {
    current.file.delete();
  } catch {}
  current = null;
}

/**
 * Spielt die Nachricht des Partners ab. Der Player braucht eine Datei, deshalb liegt das entschlüsselte Audio
 * kurz im Cache-Ordner und wird beim Stoppen gelöscht.
 */
export async function playPartnerVoice(api: Api, id: string, onEnd: () => void): Promise<void> {
  stopVoice();
  const bytes = await api.partnerVoice(id);
  const file = new File(Paths.cache, `voice-${id}.m4a`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const player = createAudioPlayer(file.uri);
  current = { player, file };
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      sub.remove();
      stopVoice();
      onEnd();
    }
  });
  player.play();
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
