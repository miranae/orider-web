import { Navigate, useLocation } from 'react-router-dom';
import { detectLangFromPath, pickFallbackLang } from '../../i18n/detector';

export function LocaleRedirect() {
  const location = useLocation();
  if (detectLangFromPath(location.pathname)) return null; // already prefixed; defensive
  const lang = pickFallbackLang();
  const target = `/${lang}${location.pathname === '/' ? '' : location.pathname}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}
