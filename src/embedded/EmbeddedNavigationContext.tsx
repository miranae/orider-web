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

/** 앱 임베드에서 호스트가 `host.sessionAccepted.capabilities` 로 알린 기능. 임베드 밖·구버전 호스트는 빈 배열. */
export const EmbeddedHostCapabilitiesContext = createContext<readonly string[]>([]);
export const useEmbeddedHostCapabilities = () => useContext(EmbeddedHostCapabilitiesContext);
