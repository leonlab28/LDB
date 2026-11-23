import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Wählbares Design ("Skin"). Standard ist bei beiden voreingestellt. Die Wahl gilt nur für dieses
 * Gerät und damit für die Person, die es benutzt; der Partner sieht davon nichts.
 */
export type SkinId = 'standard' | 'icc';
export const SKINS: { id: SkinId; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'icc', label: 'ICC' },
];

const KEY = 'ldb.skin';
const Ctx = createContext<{ skin: SkinId; setSkin: (s: SkinId) => void }>({ skin: 'standard', setSkin: () => {} });

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setState] = useState<SkinId>('standard');
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === 'icc' || v === 'standard') setState(v);
      })
      .catch(() => {});
  }, []);
  const setSkin = (s: SkinId) => {
    setState(s);
    SecureStore.setItemAsync(KEY, s).catch(() => {});
  };
  return <Ctx.Provider value={{ skin, setSkin }}>{children}</Ctx.Provider>;
}

export const useSkin = () => useContext(Ctx);
export const useIcc = () => useContext(Ctx).skin === 'icc';
