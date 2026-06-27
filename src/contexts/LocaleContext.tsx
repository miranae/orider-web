import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from '../services/firebase';
import i18n from '../i18n';
import { SUPPORTED_LANGS, type Lang } from '../i18n/detector';
import type { Units } from '../utils/units';

interface LocaleContextValue {
  locale: Lang;
  units: Units;
  setLocale: (lang: Lang) => Promise<void>;
  setUnits: (units: Units) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Lang {
  const current = (i18n.language || 'ko').split('-')[0] ?? 'ko';
  return (SUPPORTED_LANGS as readonly string[]).includes(current)
    ? (current as Lang)
    : 'ko';
}

export function LocaleProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Lang>(initialLocale);
  const [units, setUnitsState] = useState<Units>('metric');

  useEffect(() => {
    if (!userId) return;
    const ref = doc(firestore, 'users', userId);
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const fsLocale = data?.locale as Lang | undefined;
      const fsUnits = data?.units as Units | undefined;
      const pathLang = window.location.pathname.split('/')[1] ?? '';
      const urlHasLang = (SUPPORTED_LANGS as readonly string[]).includes(pathLang);
      if (fsLocale && !urlHasLang && fsLocale !== locale) {
        setLocaleState(fsLocale);
        void i18n.changeLanguage(fsLocale);
      }
      if (fsUnits && fsUnits !== units) setUnitsState(fsUnits);
    });
  }, [userId]);  

  const persist = useCallback(
    async (patch: Partial<{ locale: Lang; units: Units }>) => {
      if (!userId) return;
      try {
        await setDoc(doc(firestore, 'users', userId), patch, { merge: true });
      } catch (e) {
        console.warn('[locale] Firestore persist failed', e);
      }
    },
    [userId]
  );

  const setLocale = useCallback(
    async (lang: Lang) => {
      setLocaleState(lang);
      await i18n.changeLanguage(lang);
      void persist({ locale: lang });
    },
    [persist]
  );

  const setUnits = useCallback(
    async (next: Units) => {
      setUnitsState(next);
      void persist({ units: next });
    },
    [persist]
  );

  const value = useMemo(
    () => ({ locale, units, setLocale, setUnits }),
    [locale, units, setLocale, setUnits]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
