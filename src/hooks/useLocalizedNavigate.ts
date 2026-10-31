import { useCallback, useRef } from 'react';
import { useEmbeddedNavigation } from '../embedded/EmbeddedNavigationContext';
import { embeddedCoachDestination } from '../embedded/coachNavigation';
import { useNavigate, useParams, useLocation, type NavigateOptions } from 'react-router-dom';
import { isDetailRoute, resolveDetailHub } from "../config/navHubs";
import { stripLangPrefix, SUPPORTED_LANGS } from '../i18n/detector';

const langSet = new Set<string>([...SUPPORTED_LANGS]);

function isAbsolute(url: string) {
  return /^[a-z]+:\/\//i.test(url) || url.startsWith('//') || url.startsWith('mailto:') || url.startsWith('tel:');
}

function hasLangPrefix(path: string) {
  const seg = path.split('/')[1];
  return seg !== undefined && langSet.has(seg);
}

export function useLocalizedPath(to: string): string {
  const { lang } = useParams();
  const location = useLocation();
  const embedded = embeddedCoachDestination(location.pathname, to);
  if (embedded) return embedded;
  if (isAbsolute(to)) return to;
  const norm = to.startsWith('/') ? to : '/' + to;
  if (hasLangPrefix(norm)) return norm;
  return `/${lang ?? 'ko'}${norm}`;
}

export function useLocalizedNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useParams();
  const hostNavigate = useEmbeddedNavigation();
  const current = useRef({ navigate, location, lang, hostNavigate });
  current.current = { navigate, location, lang, hostNavigate };
  return useCallback(
    (to: string | number, opts?: NavigateOptions) => {
      const { navigate, location, lang, hostNavigate } = current.current;
      if (typeof to === 'number') {
        navigate(to);
        return;
      }
      if (isAbsolute(to)) {
        if (hostNavigate) { hostNavigate(to); return; }
        window.location.href = to;
        return;
      }
      const embedded = embeddedCoachDestination(location.pathname, to);
      if (embedded) { navigate(embedded, opts); return; }
      const norm = to.startsWith('/') ? to : '/' + to;
      const target = hasLangPrefix(norm) ? norm : `/${lang ?? 'ko'}${norm}`;
      if (hostNavigate && target.split(/[?#]/)[0] !== location.pathname) { hostNavigate(target); return; }
      const hub = resolveDetailHub(stripLangPrefix(location.pathname), location.state);
      const inferState = isDetailRoute(stripLangPrefix(norm.split(/[?#]/)[0]!));
      const state = inferState && (opts?.state === undefined || (opts.state !== null && typeof opts.state === "object"))
        ? { fromHub: hub === "settings" ? "home" : hub, ...opts?.state }
        : opts?.state;
      navigate(target, inferState ? { ...opts, state } : opts);
    },
    []
  );
}
