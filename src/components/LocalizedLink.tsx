import { Link, useLocation, type LinkProps, type To } from 'react-router-dom';
import { stripLangPrefix } from '../i18n/detector';
import { isDetailRoute, resolveDetailHub } from '../config/navHubs';
import { useLocalizedPath } from '../hooks/useLocalizedNavigate';

export function LocalizedLink({ to, state, ...rest }: LinkProps) {
  const location = useLocation();
  const pathname = typeof to === 'string' ? to : (to.pathname ?? '/');
  const localized = useLocalizedPath(pathname);
  const targetPath = stripLangPrefix(pathname.split(/[?#]/)[0]!);
  const currentHub = resolveDetailHub(stripLangPrefix(location.pathname), location.state);
  const inheritedState = state !== undefined && (state === null || typeof state !== "object") ? state : isDetailRoute(targetPath)
    ? { fromHub: currentHub === "settings" ? "home" : currentHub, ...(state && typeof state === "object" ? state : {}) }
    : state;
  if (typeof to === 'string') {
    return <Link to={localized} state={inheritedState} {...rest} />;
  }
  const target: To = { pathname: localized };
  if (to.search !== undefined) target.search = to.search;
  if (to.hash !== undefined) target.hash = to.hash;
  return <Link to={target} state={inheritedState} {...rest} />;
}
