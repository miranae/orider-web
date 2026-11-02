import { Navigate } from "react-router-dom";
import { createContext, useContext, useEffect, useRef } from "react";

export const EmbeddedNavigationContext = createContext<((destination: string) => void) | null>(null);
export const useEmbeddedNavigation = () => useContext(EmbeddedNavigationContext);

/** Shared redirects outside the coach area belong to the native host in an app session. */
export function EmbeddedOrRouterRedirect({ to }: { to: string }) {
  const navigateWithHost = useEmbeddedNavigation();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!navigateWithHost || sent.current === to) return;
    sent.current = to;
    navigateWithHost(to);
  }, [navigateWithHost, to]);
  return navigateWithHost ? null : <Navigate replace to={to} />;
}
