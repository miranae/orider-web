import { useCallback } from 'react';
import { useNavigate, useParams, type NavigateOptions } from 'react-router-dom';
import { SUPPORTED_LANGS } from '../i18n/detector';

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
  if (isAbsolute(to)) return to;
  const norm = to.startsWith('/') ? to : '/' + to;
  if (hasLangPrefix(norm)) return norm;
  return `/${lang ?? 'ko'}${norm}`;
}

export function useLocalizedNavigate() {
  const navigate = useNavigate();
  const { lang } = useParams();
  return useCallback(
    (to: string | number, opts?: NavigateOptions) => {
      if (typeof to === 'number') {
        navigate(to);
        return;
      }
      if (isAbsolute(to)) {
        window.location.href = to;
        return;
      }
      const norm = to.startsWith('/') ? to : '/' + to;
      const target = hasLangPrefix(norm) ? norm : `/${lang ?? 'ko'}${norm}`;
      navigate(target, opts);
    },
    [lang, navigate]
  );
}
