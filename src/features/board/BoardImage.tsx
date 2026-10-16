import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import SafeImage from '../../components/SafeImage';
import { normalizeUserContentUrl } from '../../utils/userContentUrl';

export function isBoardStorageImage(src: string | undefined): src is string {
  return Boolean(src && /^gs:\/\/[^/]+\/board_images\/[^/]+\/[^/]+\/[^/]+$/.test(src));
}

/** 비공개 첨부는 공유 가능한 다운로드 토큰 대신 현재 인증으로 읽는다. */
export function BoardImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  const key = JSON.stringify([src, uid]);
  useEffect(() => {
    if (!isBoardStorageImage(src)) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    getBlob(ref(storage, src), 5 * 1024 * 1024).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ key, url: objectUrl });
    }).catch(() => { if (!cancelled) setResolved(null); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, src]);
  const url = isBoardStorageImage(src) ? (resolved?.key === key ? resolved.url : undefined) : normalizeUserContentUrl(src) ?? undefined;
  return <SafeImage key={url ?? key} {...props} src={url} />;
}
