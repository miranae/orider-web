import { useCallback, useEffect, useRef, useState } from "react";
import { isRoutePosition, type RoutePosition } from "../utils/routeGeometry";

/** Photo navigation cannot outlive the activity/account that requested it. */
export function useActivityPhotoLocation(identity: string, services?: unknown, viewer?: unknown) {
  const scope = useRef({ identity, services, viewer });
  if (scope.current.identity !== identity || scope.current.services !== services || scope.current.viewer !== viewer) {
    scope.current = { identity, services, viewer };
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
      if (scope.current === currentScope) setSelection({ scope: currentScope, position });
    }, 10);
  }, [currentScope, cancel]);
  return { flyToPosition: selection?.scope === currentScope ? selection.position : null, locate };
}
