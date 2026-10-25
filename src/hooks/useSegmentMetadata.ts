import { useEffect, useState } from "react";
import { loadSegmentMetadata } from "../services/segmentMetadata";
export function useSegmentMetadata<T>(id?: string) {
  const [state, setState] = useState<{ id?: string; data: T | null; loading: boolean; error: unknown }>({ data: null, loading: !!id, error: null });
  useEffect(() => {
    let active = true;
    if (!id) return;
    loadSegmentMetadata([id]).then(rows => { if (active) setState({ id, data: (rows[0] as T) ?? null, loading: false, error: null }); })
      .catch(error => { if (active) setState({ id, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? state : { data: null, loading: !!id, error: null };
}
