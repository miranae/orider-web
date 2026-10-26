import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { SavedActivityAnalysis } from "../services/activityReanalysis";

/** Stored metrics selection belongs to one activity and exact authenticated SDK session. */
export function useSavedActivityAnalysisSelection(activityId: string | undefined) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const sdkUser = services.auth.currentUser;
  const identity = useMemo(() => ({ activityId, user, sdkUser, services }), [activityId, user, sdkUser, services]);
  const current = useRef(identity);
  current.current = identity;
  const [selection, setSelection] = useState<{ identity: typeof identity; value: SavedActivityAnalysis } | null>(null);
  const select = useCallback((value: SavedActivityAnalysis | null) => {
    if (current.current !== identity || !identity.user || identity.sdkUser !== services.auth.currentUser) return;
    setSelection(value ? { identity, value } : null);
  }, [identity, services]);
  return { selected: selection?.identity === identity ? selection.value : undefined, select };
}
