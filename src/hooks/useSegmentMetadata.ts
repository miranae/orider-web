import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { loadSegmentMetadata } from "../services/segmentMetadata";
export function useSegmentMetadata<T>(id?: string) {
  const { user } = useAuth();
  const key = JSON.stringify([id, user?.uid]);
  const [state, setState] = useState<{ key?: string; data: T | null; loading: boolean; error: unknown }>({ data: null, loading: !!id, error: null });
  useEffect(() => {
    let active = true;
    if (!id) return;
    loadSegmentMetadata([id]).then(rows => { if (active) setState({ key, data: (rows[0] as T) ?? null, loading: false, error: null }); })
      .catch(error => { if (active) setState({ key, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [id, key]);
  return state.key === key ? state : { data: null, loading: !!id, error: null };
}
