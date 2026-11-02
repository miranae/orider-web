import { Link, useLocation, type LinkProps, type To, createPath } from 'react-router-dom';
import { stripLangPrefix } from '../i18n/detector';
import { isDetailRoute, resolveDetailHub } from '../config/navHubs';
import { useLocalizedPath } from '../hooks/useLocalizedNavigate';

export function LocalizedLink({ to, state, ...rest }: LinkProps) {
  const location = useLocation();
  const pathname = typeof to === 'string' ? to : (to.pathname ?? '/');
  const fullPath = typeof to === "string" ? to : createPath({ ...to, pathname });
  const localized = useLocalizedPath(fullPath);
  const targetPath = stripLangPrefix(pathname.split(/[?#]/)[0]!);
  const currentHub = resolveDetailHub(stripLangPrefix(location.pathname), location.state);
  const inheritedState = state !== undefined && (state === null || typeof state !== "object") ? state : isDetailRoute(targetPath)
    ? { fromHub: currentHub === "settings" ? "home" : currentHub, ...(state && typeof state === "object" ? state : {}) }
    : state;
  if (typeof to === 'string') {
    return <Link to={localized} state={inheritedState} {...rest} />;
  }
  const parsed = new URL(localized, "https://localized.invalid");
  const target: To = { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash };
  return <Link to={target} state={inheritedState} {...rest} />;
}
