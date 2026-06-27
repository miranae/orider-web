import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import {
  SUPPORTED_LANGS,
  looksLikeLangCode,
  pickFallbackLang,
  type Lang,
} from '../../i18n/detector';

export function LocaleRoot() {
  const { lang } = useParams();
  const location = useLocation();
  const isValid = (SUPPORTED_LANGS as readonly string[]).includes(lang ?? '');

  useEffect(() => {
    if (isValid && i18n.language !== lang) {
      void i18n.changeLanguage(lang as Lang);
    }
    if (isValid) {
      document.documentElement.lang = lang as Lang;
    }
  }, [isValid, lang]);

  if (!isValid) {
    const fallback = pickFallbackLang();
    // If the segment looks like a real lang code (e.g. 'fr'), it was a typed
    // unsupported language — strip and replace. Otherwise the user typed a
    // path without lang prefix (e.g. '/settings') — keep entire pathname.
    const newPath = looksLikeLangCode(lang)
      ? location.pathname.replace(/^\/[^/]+/, '')
      : location.pathname;
    return <Navigate to={`/${fallback}${newPath}${location.search}${location.hash}`} replace />;
  }
  return <Outlet />;
}
