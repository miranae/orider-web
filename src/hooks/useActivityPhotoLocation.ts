import { onIdTokenChanged, type Auth } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { isRoutePosition, type RoutePosition } from "../utils/routeGeometry";

/** Photo navigation cannot outlive the activity/account that requested it. */
export function useActivityPhotoLocation(identity: string, services?: unknown, auth?: { currentUser: unknown }) {
  const viewer = auth?.currentUser;
  const tokenVersion = useRef(0);
  const [, observeViewer] = useState(0);
  useEffect(() => {
    if (!auth) return;
    let initial = true;
    return onIdTokenChanged(auth as Auth, () => {
      if (initial) { initial = false; return; }
      tokenVersion.current++;
      observeViewer(tokenVersion.current);
    });
  }, [auth]);
  const scope = useRef({ identity, services, auth, viewer, tokenVersion: tokenVersion.current });
  if (scope.current.identity !== identity || scope.current.services !== services || scope.current.auth !== auth || scope.current.viewer !== viewer || scope.current.tokenVersion !== tokenVersion.current) {
    scope.current = { identity, services, auth, viewer, tokenVersion: tokenVersion.current };
  }
  const currentScope = scope.current;
  const [selection, setSelection] = useState<{ scope: typeof currentScope; position: RoutePosition } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [currentScope, cancel]);
  const locate = useCallback((position: RoutePosition) => {
    cancel();
    setSelection(null);
    if (!isRoutePosition(position)) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (scope.current === currentScope && auth?.currentUser === currentScope.viewer && tokenVersion.current === currentScope.tokenVersion) setSelection({ scope: currentScope, position });
    }, 10);
  }, [currentScope, cancel, auth]);
  return { flyToPosition: selection?.scope === currentScope ? selection.position : null, locate };
}
