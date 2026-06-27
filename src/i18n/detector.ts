import type { CustomDetector } from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGS = ['ko', 'en'] as const;
export type Lang = typeof SUPPORTED_LANGS[number];

export function detectLangFromPath(pathname: string): Lang | null {
  const seg = pathname.split('/')[1];
  return SUPPORTED_LANGS.includes(seg as Lang) ? (seg as Lang) : null;
}

/** Looks like a 2-letter language code (e.g. 'fr', 'ja-JP') — used to distinguish
 *  unsupported lang prefixes from regular path segments like 'settings'. */
export function looksLikeLangCode(seg: string | undefined | null): boolean {
  return !!seg && /^[a-z]{2}(-[A-Z]{2})?$/.test(seg);
}

/** /:lang prefix를 벗긴 정규화 경로 ("/ko/courses" → "/courses", "/ko" → "/", "/foo" → "/foo") */
export function stripLangPrefix(pathname: string): string {
  const seg = pathname.split('/')[1];
  if (seg && (SUPPORTED_LANGS as readonly string[]).includes(seg)) {
    const rest = pathname.slice(1 + seg.length);
    return rest === '' ? '/' : rest;
  }
  return pathname;
}

export function pickFallbackLang(): Lang {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) return stored as Lang;
  } catch {
    // localStorage unavailable
  }
  const navLang = typeof navigator !== 'undefined' ? navigator.language : 'ko';
  const nav = (navLang ?? 'ko').split('-')[0] ?? 'ko';
  if ((SUPPORTED_LANGS as readonly string[]).includes(nav)) return nav as Lang;
  return 'ko';
}

export const pathDetector: CustomDetector = {
  name: 'path',
  lookup() {
    if (typeof window === 'undefined') return undefined;
    return detectLangFromPath(window.location.pathname) ?? undefined;
  },
};
