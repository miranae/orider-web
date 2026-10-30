import { useEffect, useRef, useState, type SetStateAction } from "react";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";

/** Tab-local UI hints only: never responses, activity IDs, metrics or credentials. */
export function usePeriodControls<T>(ownerUid: string, kind: string, initial: () => T, validate: (value: unknown) => T | null) {
  const services = useFirebaseServices();
  const user = services.auth.currentUser;
  const scope = JSON.stringify([services.auth.app?.options.projectId, services.auth.app?.name, ownerUid, user?.metadata?.creationTime, kind]);
  const [saved, setSaved] = useState(() => ({ scope, value: initial() }));
  const value = saved.scope === scope ? saved.value : initial();
  const ref = useRef({ scope, value, edited: false, key: null as string | null });
  if (ref.current.scope !== scope) ref.current = { scope, value, edited: false, key: null };
  ref.current.value = value;
  const validator = useRef(validate); validator.current = validate;
  useEffect(() => {
    let cancelled = false;
    const current = ref.current;
    if (!services.auth.app?.options.projectId || !user || user.uid !== ownerUid || user.isAnonymous || !user.metadata?.creationTime || !globalThis.crypto?.subtle) return;
    void (async () => {
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
        if (cancelled || ref.current !== current || services.auth.currentUser !== user) return;
        const key = `orider-period-controls-v1-${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("")}`;
        current.key = key;
        if (current.edited) { sessionStorage.setItem(key, JSON.stringify(current.value)); return; }
        const text = sessionStorage.getItem(key);
        const restored = text && text.length <= 2048 ? validator.current(JSON.parse(text)) : null;
        if (restored) { current.value = restored; setSaved({ scope, value: restored }); }
        else if (text) sessionStorage.removeItem(key);
      } catch { /* Unavailable or corrupt storage must not block analysis. */ }
    })();
    return () => { cancelled = true; };
  }, [scope, services, ownerUid, user]);
  const set = (update: SetStateAction<T>) => {
    const current = ref.current;
    const next = typeof update === "function" ? (update as (previous: T) => T)(current.value) : update;
    current.edited = true; current.value = next; setSaved({ scope, value: next });
    if (current.key && services.auth.currentUser?.uid === ownerUid && !services.auth.currentUser.isAnonymous) {
      try { sessionStorage.setItem(current.key, JSON.stringify(next)); } catch { /* Optional UI hints. */ }
    }
  };
  return [value, set] as const;
}
