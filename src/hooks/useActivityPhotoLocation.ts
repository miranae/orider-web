import type { Auth } from "firebase/auth";
import { observeFirebaseSignIn } from "../utils/firebaseSignIn";
import { useCallback, useEffect, useRef, useState } from "react";
import { isRoutePosition, type RoutePosition } from "../utils/routeGeometry";

/** Photo navigation cannot outlive the activity/account that requested it. */
export function useActivityPhotoLocation(identity: string, services?: unknown, auth?: { currentUser: unknown }) {
  const viewer = auth?.currentUser;
  const signedInAt = (viewer as Auth["currentUser"] | undefined)?.metadata?.lastSignInTime;
  const tokenVersion = useRef(0);
  const [, observeViewer] = useState(0);
  useEffect(() => {
    if (!auth) return;
    return observeFirebaseSignIn(auth as Auth, () => {
      tokenVersion.current++;
      observeViewer(tokenVersion.current);
    });
  }, [auth]);
  const scope = useRef({ identity, services, auth, viewer, signedInAt, tokenVersion: tokenVersion.current });
  if (scope.current.identity !== identity || scope.current.services !== services || scope.current.auth !== auth || scope.current.viewer !== viewer || scope.current.signedInAt !== signedInAt || scope.current.tokenVersion !== tokenVersion.current) {
    scope.current = { identity, services, auth, viewer, signedInAt, tokenVersion: tokenVersion.current };
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
      if (scope.current === currentScope && auth?.currentUser === currentScope.viewer && tokenVersion.current === currentScope.tokenVersion
        && (auth?.currentUser as Auth["currentUser"] | undefined)?.metadata?.lastSignInTime === currentScope.signedInAt) setSelection({ scope: currentScope, position });
    }, 10);
  }, [currentScope, cancel, auth]);
  return { flyToPosition: selection?.scope === currentScope ? selection.position : null, locate };
}
