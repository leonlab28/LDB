// Eigene einfarbige Symbole (Silhouetten) statt Emojis, damit sie zum Stil der App passen.
// Alle auf einem 24er-Raster, Farbe und Größe kommen von außen.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { size?: number; color?: string };

/** Mikrofon: Kapsel, Bügel, Fuß. */
export function MicIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={8.5} y={2.5} width={7} height={12} rx={3.5} fill={color} />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M12 17.5v3.5M8.5 21h7" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Abspielen: abgerundetes Dreieck. */
export function PlayIcon({ size = 16, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8a1.05 1.05 0 0 0 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z" fill={color} />
    </Svg>
  );
}

/** Stopp: abgerundetes Quadrat. */
export function StopIcon({ size = 16, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={6} width={12} height={12} rx={2.5} fill={color} />
    </Svg>
  );
}

/** Kamera: Gehäuse mit Objektiv als Aussparung. */
export function CameraIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fillRule="evenodd"
        d="M9.2 4h5.6l1.6 2.2H19a2.5 2.5 0 0 1 2.5 2.5v8.8A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V8.7A2.5 2.5 0 0 1 5 6.2h2.6L9.2 4zM12 17.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2z"
        fill={color}
      />
    </Svg>
  );
}

/** Plus. */
export function PlusIcon({ size = 22, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** Notiz: Blatt mit Zeilen. */
export function NoteIcon({ size = 22, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fillRule="evenodd" d="M6 3h12a2 2 0 0 1 2 2v10l-6 6H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5v1.8h8V8H8zm0 4v1.8h5V12H8z" fill={color} />
    </Svg>
  );
}

/** Zahnrad: acht Zähne, Loch in der Mitte. */
export function GearIcon({ size = 20, color = '#fff' }: P) {
  const teeth = 8;
  const rOut = 10.5;
  const rIn = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const at = (a: number) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
    pts.push(`${i === 0 ? 'M' : 'L'}${at(a0)} L${at(a1)}`);
  }
  const ring = 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fillRule="evenodd" d={`${pts.join(' ')} Z ${ring}`} fill={color} strokeLinejoin="round" stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

/** Schließen. */
export function CloseIcon({ size = 14, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Schloss (Inhalt lässt sich nicht entschlüsseln). */
export function LockIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke={color} strokeWidth={2} fill="none" />
      <Rect x={5} y={10} width={14} height={10.5} rx={2.5} fill={color} />
      <Circle cx={12} cy={15.2} r={1.6} fill="#000" opacity={0.35} />
    </Svg>
  );
}
