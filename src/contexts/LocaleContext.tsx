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
import { useFirebaseServices } from './FirebaseServicesContext';
import { logClientError } from '../services/errorLogger';
import i18n from '../i18n';
import { AUTO_LOCALE_REDIRECT_KEY, SUPPORTED_LANGS, type Lang } from '../i18n/detector';
import type { Units } from '../utils/units';

interface LocaleContextValue {
  locale: Lang;
  units: Units;
  setLocale: (lang: Lang) => Promise<void>;
  setUnits: (units: Units) => Promise<void>;
  /** 서버 하루 경계용 IANA 시간대. null = 미설정(서버가 Asia/Seoul 폴백). */
  timezone: string | null;
  /** 저장 성공 여부를 돌려준다. 실패하면 화면 값을 이전으로 되돌린다. */
  setTimezone: (timezone: string | null) => Promise<boolean>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Lang {
  const current = (i18n.language || 'ko').split('-')[0] ?? 'ko';
  return (SUPPORTED_LANGS as readonly string[]).includes(current)
    ? (current as Lang)
    : 'ko';
}

function replacePathLang(lang: Lang): void {
  const parts = window.location.pathname.split('/');
  if ((SUPPORTED_LANGS as readonly string[]).includes(parts[1] ?? '')) {
    parts[1] = lang;
    window.history.replaceState(
      window.history.state,
      '',
      `${parts.join('/')}${window.location.search}${window.location.hash}`
    );
  }
}

function consumeAutoLocaleRedirectMarker(): { target?: string; lang?: string } | null {
  try {
    const raw = sessionStorage.getItem(AUTO_LOCALE_REDIRECT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AUTO_LOCALE_REDIRECT_KEY);
    return JSON.parse(raw) as { target?: string; lang?: string };
  } catch {
    return null;
  }
}

export function LocaleProvider({
  userId,
  profile,
  children,
}: {
  userId: string | null;
  profile?: Partial<{ locale: Lang; units: Units; timezone: string | null }> | null;
  children: ReactNode;
}) {
  // 싱글턴이 아니라 컨텍스트에서 받는다 — 임베드는 별도 named app 을 쓰므로 싱글턴이
  // undefined 다(#847). 일반 트리에서는 기본 컨텍스트가 그 싱글턴이라 동작이 같다.
  const { firestore } = useFirebaseServices();
  const [locale, setLocaleState] = useState<Lang>(initialLocale);
  const [units, setUnitsState] = useState<Units>('metric');
  const [timezone, setTimezoneState] = useState<string | null>(null);
  const profileTimezone = profile?.timezone ?? null;

  // 프로필 값이 바뀔 때만 동기화 — 저장 직후 낙관적 값이 옛 스냅샷으로 되돌아가지 않게.
  useEffect(() => {
    setTimezoneState(profileTimezone);
  }, [profileTimezone]);

  useEffect(() => {
    const fsLocale = profile?.locale;
    const fsUnits = profile?.units;
    const pathLang = window.location.pathname.split('/')[1] ?? '';
    const urlHasLang = (SUPPORTED_LANGS as readonly string[]).includes(pathLang);
    if (fsLocale && urlHasLang && fsLocale !== pathLang) {
      const marker = consumeAutoLocaleRedirectMarker();
      const currentTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (marker?.target === currentTarget) {
        setLocaleState(fsLocale);
        void i18n.changeLanguage(fsLocale);
        replacePathLang(fsLocale);
      }
    } else if (fsLocale && !urlHasLang && fsLocale !== locale) {
      setLocaleState(fsLocale);
      void i18n.changeLanguage(fsLocale);
    }
    if (fsUnits && fsUnits !== units) setUnitsState(fsUnits);
  }, [locale, profile?.locale, profile?.units, units]);

  const persist = useCallback(
    async (
      patch: Partial<{ locale: Lang; units: Units; timezone: string | null }>
    ): Promise<boolean> => {
      if (!userId) return false;
      try {
        await setDoc(doc(firestore, 'users', userId), patch, { merge: true });
        return true;
      } catch (err) {
        logClientError('LocaleContext.persist', err, { patch: Object.keys(patch) });
        return false;
      }
    },
    [firestore, userId]
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

  const setTimezone = useCallback(
    async (next: string | null) => {
      const prev = timezone;
      setTimezoneState(next);
      const ok = await persist({ timezone: next });
      if (!ok) setTimezoneState(prev);
      return ok;
    },
    [persist, timezone]
  );

  const value = useMemo(
    () => ({ locale, units, setLocale, setUnits, timezone, setTimezone }),
    [locale, units, setLocale, setUnits, timezone, setTimezone]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
