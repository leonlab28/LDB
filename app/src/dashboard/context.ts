import type { PhotoLoader } from '../components/PhotoThumb';
import type { Api } from '../lib/api';
import type { View } from '../lib/types';

export type Mode = 'partner' | 'me';
export type PopupKind = 'photos' | 'light' | 'notes' | 'map' | 'calendar' | 'voice' | 'settings';

export interface DashCtx {
  api: Api;
  mode: Mode;
  /** Was die Kacheln zeigen: Partner (Drüben), ich selbst (Ich) oder bei der Vorschau ich selbst als Partner. */
  view: View | null;
  me: View | null;
  myTz: string;
  now: number;
  /** Nur Entwicklung: Drüben zeigt die eigenen Inhalte. Keine Rückmeldungen an den Server. */
  mirror: boolean;
  loadPhoto: PhotoLoader;
  refresh: () => void;
  toast: (msg: string) => void;
  open: (p: PopupKind) => void;
}

/** Interaktion zurück an den Server (gesehen, Herz, angehört) nur in der echten Drüben-Ansicht. */
export const sendsReceipts = (c: DashCtx) => c.mode === 'partner' && !c.mirror;
