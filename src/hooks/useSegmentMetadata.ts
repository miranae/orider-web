import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import { loadSegmentMetadata } from "../services/segmentMetadata";
export function useSegmentMetadata<T>(id?: string) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const uid = user?.uid, viewer = services.auth.currentUser;
  const identity = useRef({ id, uid, services, viewer, epoch: 0 });
  if (identity.current.id !== id || identity.current.uid !== uid || identity.current.services !== services || identity.current.viewer !== viewer) {
    identity.current = { id, uid, services, viewer, epoch: identity.current.epoch + 1 };
  }
  const key = JSON.stringify([id, uid, identity.current.epoch]);
  const [state, setState] = useState<{ key?: string; data: T | null; loading: boolean; error: unknown }>({ data: null, loading: !!id, error: null });
  useEffect(() => {
    let active = true;
    if (!id) return;
    loadSegmentMetadata([id], services).then(rows => { if (active) setState({ key, data: (rows[0] as T) ?? null, loading: false, error: null }); })
      .catch(error => { if (active) setState({ key, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [id, key, services]);
  return state.key === key ? state : { data: null, loading: !!id, error: null };
}
