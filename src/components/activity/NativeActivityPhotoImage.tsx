import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { useNativeActivityPhoto } from "../../hooks/useNativeActivityPhoto";
import { type NativePhotoReference } from "../../services/nativeActivityPhoto";
import { isPublicActivityAccessError } from "../../services/publicActivityDetail";
import { Button, Text } from "../../theme/components";

export function NativeActivityPhotoImage({ nativePhoto, onAccessRevoked, retryable = false, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
  nativePhoto: NativePhotoReference; onAccessRevoked?: () => void; retryable?: boolean;
}) {
  const { t } = useTranslation("activity");
  const anchor = useRef<HTMLSpanElement>(null);
  const [nearby, setNearby] = useState(typeof IntersectionObserver === "undefined");
  const { url, error, retry } = useNativeActivityPhoto(nativePhoto, nearby);
  useEffect(() => {
    if (!anchor.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { setNearby(entries.some(entry => entry.isIntersecting)); }, { rootMargin: "200px" });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (error && isPublicActivityAccessError(error)) onAccessRevoked?.(); }, [error, onAccessRevoked]);
  return <span ref={anchor} style={{ display: "block", width: "100%", height: "100%", minHeight: "var(--space-8)" }}>
    {url ? <img {...props} src={url} /> : error ? <Text as="span" variant="caption" role="status">{t("publicDetail.photosFailed")}</Text> : <span role="status" aria-label={t("page.photoPreview")} />}
      {error != null && retryable && <Button size="sm" variant="outline" onClick={retry}>{t("page.retry")}</Button>}
  </span>;
}
