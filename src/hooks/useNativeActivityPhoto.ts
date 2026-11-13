import { logClientError } from "../services/errorLogger";
import { useEffect, useState } from "react";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { authorizeNativeActivityPhoto, loadNativeActivityPhoto, type NativePhotoReference } from "../services/nativeActivityPhoto";

export const PHOTO_REVALIDATE_AFTER_MS = 5 * 60_000;

/** No persistent cache or bearer URLs. Clear image bytes on account change, unmount and backgrounding. */
export function useNativeActivityPhoto(photo: NativePhotoReference | undefined, enabled = true) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const activityId = photo?.activityId;
  const photoId = photo?.photoId;
  const key = JSON.stringify([user?.uid ?? null, activityId, photoId]);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState !== "hidden");
  const [result, setResult] = useState<{ key: string; services: typeof services; url: string | null; error: unknown } | null>(null);
  useEffect(() => {
    const change = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (!enabled || !visible || !activityId || !photoId) return;
    let active = true;
    let url: string | null = null;
    // 주기 재확인 없음: 보이는 사진마다 30초마다 getActivityPhotoData 를 불러, 사진이 많은 화면을
    // 띄워 두면 호출이 끝없이 쌓였다. 탭을 숨기면 바이트를 지우고 돌아올 때 다시 받으며(위 visible),
    // 창 포커스는 마지막 확인 뒤 PHOTO_REVALIDATE_AFTER_MS 가 지났을 때만 권한을 다시 확인한다.
    let verifiedAt = 0, checking = false;
    const revoke = (error: unknown) => {
      if (!active) return;
      const code = (error as { code?: string } | null)?.code;
      if (code !== "not-found" && code !== "functions/not-found") logClientError("useNativeActivityPhoto.revalidate", error, { activityId, photoId }, services);
      if (url) URL.revokeObjectURL(url);
      url = null;
      setResult({ key, services, url: null, error });
    };
    const focus = () => {
      if (!url || checking || Date.now() - verifiedAt < PHOTO_REVALIDATE_AFTER_MS) return;
      checking = true;
      void authorizeNativeActivityPhoto(services, { activityId, photoId })
        .then(() => { verifiedAt = Date.now(); }, revoke)
        .finally(() => { checking = false; });
    };
    setResult(null);
    void loadNativeActivityPhoto(services, { activityId, photoId }).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      verifiedAt = Date.now();
      setResult({ key, services, url, error: null });
    }).catch(error => { if (active) setResult({ key, services, url: null, error }); });
    window.addEventListener("focus", focus);
    return () => { active = false; window.removeEventListener("focus", focus); if (url) URL.revokeObjectURL(url); };
  }, [key, services, activityId, photoId, attempt, enabled, visible]);
  const current = enabled && visible && result?.key === key && result.services === services ? result : null;
  return { url: current?.url ?? null, error: current?.error ?? null, retry: () => setAttempt(value => value + 1) };
}
