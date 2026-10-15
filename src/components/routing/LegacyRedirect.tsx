import { Navigate, useLocation, useParams } from "react-router-dom";

/** 옛 /settings?section= 값 → 새 경로. 알 수 없는 값은 account. */
const SETTINGS_SECTION_TARGETS: Record<string, string> = {
  account: "/settings/account",
  ai_coach: "/settings/account",
  connections: "/settings/connections",
  health_sources: "/settings/connections",
  app: "/settings/display",
  developer: "/settings/developer",
  training: "/coach/condition",
  equipment: "/athlete/me/gear",
  device: "/settings/device",
};

/** `/coach/chat/:threadId` 같은 패턴의 `:name` 을 params 값으로 치환한다. */
export function fillPathParams(pattern: string, params: Record<string, string | undefined>): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ""));
}

/** 옛 /settings 주소 → 새 경로(+ section 키만 제거한 search). */
export function resolveLegacySettingsTarget(search: string): { pathname: string; search: string } {
  const params = new URLSearchParams(search);
  const section = params.get("section");
  params.delete("section");
  const rest = params.toString();
  return {
    pathname: section === "equipment" && params.get("panel") === "data-pages" ? "/settings/device" : (section && SETTINGS_SECTION_TARGETS[section]) || "/settings/account",
    search: rest ? `?${rest}` : "",
  };
}

function withLang(lang: string | undefined, path: string): string {
  return `/${lang ?? "ko"}${path}`;
}

/**
 * 옛 경로 → 새 경로 영구 리디렉션(외부 유입·북마크·푸시용).
 * params 를 치환하고 search·hash 를 그대로 넘긴다. 내부 링크는 새 경로를 직접 쓴다.
 */
export function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  const location = useLocation();
  const [path, defaultHash] = fillPathParams(to, params).split("#");
  const target = withLang(params.lang, path!);
  return <Navigate to={{ pathname: target, search: location.search, hash: defaultHash ? `#${defaultHash}` : location.hash }} state={location.state} replace />;
}

/** 옛 /settings?section=… → /settings/<tab> 또는 /athlete/me/gear. section 만 제거, 나머지 보존. */
export function LegacySettingsRedirect() {
  const { lang } = useParams();
  const location = useLocation();
  const { pathname, search } = resolveLegacySettingsTarget(location.search);
  return <Navigate to={{ pathname: withLang(lang, pathname), search, hash: new URLSearchParams(location.search).get("section") === "training" ? "#thresholds" : location.hash }} state={location.state} replace />;
}
