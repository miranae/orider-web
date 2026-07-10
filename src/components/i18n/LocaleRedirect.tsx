import { Navigate, useLocation } from 'react-router-dom';
import { AUTO_LOCALE_REDIRECT_KEY, detectLangFromPath, pickFallbackLang } from '../../i18n/detector';

export function LocaleRedirect() {
  const location = useLocation();
  if (detectLangFromPath(location.pathname)) return null; // already prefixed; defensive
  const lang = pickFallbackLang();
  const target = `/${lang}${location.pathname === '/' ? '' : location.pathname}${location.search}${location.hash}`;
  try {
    sessionStorage.setItem(AUTO_LOCALE_REDIRECT_KEY, JSON.stringify({ target, lang }));
  } catch {
    // sessionStorage can be unavailable in private or embedded contexts.
  }
  return <Navigate to={target} replace />;
}
