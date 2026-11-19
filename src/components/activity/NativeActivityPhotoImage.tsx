import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { useNativeActivityPhoto } from "../../hooks/useNativeActivityPhoto";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { type NativePhotoReference } from "../../services/nativeActivityPhoto";
import { logClientError } from "../../services/errorLogger";
import { Button, Text } from "../../theme/components";

export function NativeActivityPhotoImage({ nativePhoto, onAccessRevoked, retryable = false, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
  nativePhoto: NativePhotoReference; onAccessRevoked?: () => void; retryable?: boolean;
}) {
  const { t } = useTranslation("activity");
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser;
  const anchor = useRef<HTMLSpanElement>(null);
  const [nearby, setNearby] = useState(typeof IntersectionObserver === "undefined");
  const { url, error, retry } = useNativeActivityPhoto(nativePhoto, nearby);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const decodeFailed = url !== null && failedUrl === url;
  useEffect(() => {
    if (!anchor.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { setNearby(entries.some(entry => entry.isIntersecting)); }, { rootMargin: "200px" });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // A removed/missing photo does not imply that the activity itself is inaccessible.
    if (error && typeof error === "object" && "code" in error && error.code === "functions/permission-denied") onAccessRevoked?.();
  }, [error, onAccessRevoked]);
  return <span ref={anchor} data-photo-state={error || decodeFailed ? "error" : url ? "ready" : "pending"} style={{ display: "block", width: "100%", height: "100%", minHeight: "var(--space-8)" }}>
    {url && !decodeFailed ? <img {...props} src={url} onError={event => {
      setFailedUrl(url);
      logClientError("NativeActivityPhotoImage.decode", new Error("activity-photo-image-decode-failed"), {}, services, viewer);
      props.onError?.(event);
    }} /> : error || decodeFailed ? <Text as="span" variant="caption" role="status">{t("publicDetail.photosFailed")}</Text> : <span role="status" aria-label={t("page.photoPreview")} />}
      {(error != null || decodeFailed) && retryable && <Button size="sm" variant="outline" onClick={() => { setFailedUrl(null); retry(); }}>{t("page.retry")}</Button>}
  </span>;
}
