import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../services/firebase';
import { logClientError } from '../services/errorLogger';
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
  profile,
  children,
}: {
  userId: string | null;
  profile?: Partial<{ locale: Lang; units: Units }> | null;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Lang>(initialLocale);
  const [units, setUnitsState] = useState<Units>('metric');

  useEffect(() => {
    const fsLocale = profile?.locale;
    const fsUnits = profile?.units;
    const pathLang = window.location.pathname.split('/')[1] ?? '';
    const urlHasLang = (SUPPORTED_LANGS as readonly string[]).includes(pathLang);
    if (fsLocale && !urlHasLang && fsLocale !== locale) {
      setLocaleState(fsLocale);
      void i18n.changeLanguage(fsLocale);
    }
    if (fsUnits && fsUnits !== units) setUnitsState(fsUnits);
  }, [locale, profile?.locale, profile?.units, units]);

  const persist = useCallback(
    async (patch: Partial<{ locale: Lang; units: Units }>) => {
      if (!userId) return;
      try {
        await setDoc(doc(firestore, 'users', userId), patch, { merge: true });
      } catch (err) {
        logClientError('LocaleContext.persist', err, { patch: Object.keys(patch) });
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
