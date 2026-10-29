import { useEffect, useState } from "react";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { authorizeNativeActivityPhoto, loadNativeActivityPhoto, type NativePhotoReference } from "../services/nativeActivityPhoto";

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheck = () => {
      timer = setTimeout(() => {
        void authorizeNativeActivityPhoto(services, { activityId, photoId }).then(() => {
          if (active) recheck();
        }).catch(error => {
          if (!active) return;
          if (url) URL.revokeObjectURL(url);
          url = null;
          setResult({ key, services, url: null, error });
        });
      }, 30000);
    };
    setResult(null);
    void loadNativeActivityPhoto(services, { activityId, photoId }).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setResult({ key, services, url, error: null });
      recheck();
    }).catch(error => { if (active) setResult({ key, services, url: null, error }); });
    return () => { active = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [key, services, activityId, photoId, attempt, enabled, visible]);
  const current = enabled && visible && result?.key === key && result.services === services ? result : null;
  return { url: current?.url ?? null, error: current?.error ?? null, retry: () => setAttempt(value => value + 1) };
}
