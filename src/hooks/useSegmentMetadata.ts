import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSegmentMetadata } from "../services/segmentMetadata";
import { logClientError } from "../services/errorLogger";
export function useSegmentMetadata<T>(id?: string) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const uid = user?.uid, viewer = services.auth.currentUser;
  const identity = useRef({ id, uid, services, viewer, epoch: 0 });
  if (identity.current.id !== id || identity.current.uid !== uid || identity.current.services !== services || identity.current.viewer !== viewer) {
    identity.current = { id, uid, services, viewer, epoch: identity.current.epoch + 1 };
  }
  // retry 는 같은 대상을 새로 읽는다 — 키가 바뀌므로 이전 요청의 늦은 응답은 버려진다.
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([id, uid, identity.current.epoch, attempt]);
  const [state, setState] = useState<{ key?: string; data: T | null; loading: boolean; error: unknown }>({ data: null, loading: !!id, error: null });
  useEffect(() => {
    let active = true;
    if (!id) return;
    loadSegmentMetadata([id], services).then(rows => { if (active) setState({ key, data: (rows[0] as T) ?? null, loading: false, error: null }); })
      .catch(error => {
        logClientError("useSegmentMetadata", error, { segmentId: id });
        if (active) setState({ key, data: null, loading: false, error });
      });
    return () => { active = false; };
  }, [id, key, services]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...(state.key === key ? state : { data: null, loading: !!id, error: null }), retry };
}
