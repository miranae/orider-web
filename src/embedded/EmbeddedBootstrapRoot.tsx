import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useParams } from "react-router-dom";

import type { UserProfile } from "@shared/types";
import { AuthContextProvider, type AuthContextValue } from "../contexts/AuthContext";
import {
  FirebaseServicesProvider,
  type FirebaseServices,
} from "../contexts/FirebaseServicesContext";
import { LocaleProvider } from "../contexts/LocaleContext";
import i18n from "../i18n";
import { consumeAppHandoffCode } from "../services/appHandoff";
import {
  createEmbeddedBridge,
  createWebViewTransport,
  type EmbeddedBridge,
  type HostBridgeEnvelope,
} from "./bridge";
import {
  ensureEmbeddedAppCheckReady,
  initEmbeddedFirebase,
} from "./embeddedFirebase";
import "./embedded.css";

const ActivityAnalysisSurface = lazy(() => import("./surfaces/ActivityAnalysisSurface"));
const FitnessSurface = lazy(() => import("./surfaces/FitnessSurface"));
const PlanSurface = lazy(() => import("./surfaces/PlanSurface"));

const CONTRACT_VERSION = 1 as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const SUPPORTED_LOCALES = new Set(["ko", "en"]);

type HostTheme = {
  mode: "light" | "dark";
  colors?: {
    bg?: string;
    surface?: string;
    textPrimary?: string;
    textSecondary?: string;
    accent?: string;
  };
};

interface AcceptedSession {
  theme: HostTheme;
  locale: "ko" | "en";
  safeInsets: { top: number; bottom: number };
}

interface EmbeddedBootstrapRootProps {
  bridgeFactory?: () => EmbeddedBridge;
  surfaceKind?: EmbeddedSurfaceKind;
}

export type EmbeddedSurfaceKind = "activity-analysis" | "fitness" | "plan";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function parseAuthorizePayload(payload: unknown): { expectedUid: string } | null {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["expectedUid", "contractVersion"])) return null;
  if (
    payload.contractVersion !== CONTRACT_VERSION
    || typeof payload.expectedUid !== "string"
    || payload.expectedUid.length === 0
    || payload.expectedUid.length > 128
  ) return null;
  return { expectedUid: payload.expectedUid };
}

function parseHostTheme(value: unknown): HostTheme | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["mode", "colors"])) return null;
  if (value.mode !== "light" && value.mode !== "dark") return null;
  if (value.colors === undefined) return { mode: value.mode };
  if (!isRecord(value.colors) || !hasOnlyKeys(value.colors, [
    "bg",
    "surface",
    "textPrimary",
    "textSecondary",
    "accent",
  ])) return null;
  for (const color of Object.values(value.colors)) {
    if (typeof color !== "string" || !HEX_COLOR.test(color)) return null;
  }
  return { mode: value.mode, colors: value.colors };
}

function parseAcceptedSession(payload: unknown): AcceptedSession | null {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["theme", "locale", "safeInsets"])) return null;
  const theme = parseHostTheme(payload.theme);
  if (!theme || typeof payload.locale !== "string" || !SUPPORTED_LOCALES.has(payload.locale)) return null;
  if (!isRecord(payload.safeInsets) || !hasOnlyKeys(payload.safeInsets, ["top", "bottom"])) return null;
  const { top, bottom } = payload.safeInsets;
  if (
    typeof top !== "number"
    || typeof bottom !== "number"
    || !Number.isFinite(top)
    || !Number.isFinite(bottom)
    || top < 0
    || bottom < 0
    || top > 200
    || bottom > 200
  ) return null;
  return {
    theme,
    locale: payload.locale as AcceptedSession["locale"],
    safeInsets: { top, bottom },
  };
}

function isEmptyPayload(payload: unknown): boolean {
  return isRecord(payload) && Object.keys(payload).length === 0;
}

function isLifecyclePayload(payload: unknown): boolean {
  return isRecord(payload)
    && hasOnlyKeys(payload, ["state"])
    && (payload.state === "foreground" || payload.state === "background");
}

/**
 * 테마 토큰을 documentElement 인라인 속성으로 복사한다.
 *
 * WKWebView 는 로드 후 JS 로 바뀐 `data-theme` 을 스타일 재계산에 반영하지 않는 경우가
 * 있다(iOS 시뮬레이터 실측: attr=dark 인데 --bg-0 은 light. 강제 리플로우로도 해소되지
 * 않음. 같은 페이지가 Chrome 에서는 정상). 팔레트를 여기에 복제하지 않고 이미 로드된
 * 스타일시트에서 해당 모드의 규칙을 그대로 읽어 인라인으로 적용해, 선택자 매칭에
 * 의존하지 않고도 전체 토큰(bg-0..4 · ink · accent 등)이 일관되게 적용되게 한다.
 */
function applyThemeTokensInline(mode: "light" | "dark"): void {
  const selector = mode === "dark" ? ':root[data-theme="dark"]' : ":root";
  const target = document.documentElement;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin 시트는 건너뛴다
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule) || rule.selectorText !== selector) continue;
      for (const name of Array.from(rule.style)) {
        if (!name.startsWith("--")) continue;
        target.style.setProperty(name, rule.style.getPropertyValue(name).trim());
      }
    }
  }
}

function applyHostContract(root: HTMLElement, session: AcceptedSession): void {
  document.documentElement.setAttribute("data-theme", session.theme.mode);
  applyThemeTokensInline(session.theme.mode);
  const fallback = session.theme.mode === "dark"
    ? {
      bg: "oklch(0.13 0.007 250)",
      surface: "oklch(0.18 0.008 250)",
      textPrimary: "oklch(0.97 0.003 250)",
      textSecondary: "oklch(0.80 0.006 250)",
      accent: "oklch(0.78 0.120 192)",
    }
    : {
      bg: "oklch(0.98 0.004 85)",
      surface: "oklch(0.995 0.002 85)",
      textPrimary: "oklch(0.18 0.010 240)",
      textSecondary: "oklch(0.28 0.010 240)",
      accent: "oklch(0.56 0.115 192)",
    };
  // 계산된 CSS 변수를 읽지 않고 모드 상수를 정본으로 쓴다. WebKit(WKWebView)은 방금 건
  // data-theme 을 반영하지 않은 계산값을 돌려줘, 강제 리플로우를 넣어도 다크 모드에서
  // 라이트 토큰을 읽었다(iOS 시뮬레이터 실측: attr=dark 인데 --bg-0 은 light).
  // 값은 src/theme/generated.css 의 :root / :root[data-theme="dark"] 와 동일하게 유지한다.
  const defaults = fallback;
  const colors = { ...defaults, ...session.theme.colors };
  root.style.setProperty("--orider-host-bg", colors.bg);
  root.style.setProperty("--orider-host-surface", colors.surface);
  root.style.setProperty("--orider-host-text-primary", colors.textPrimary);
  root.style.setProperty("--orider-host-text-secondary", colors.textSecondary);
  root.style.setProperty("--orider-host-accent", colors.accent);
  root.style.setProperty("--orider-host-safe-top", `${session.safeInsets.top}px`);
  root.style.setProperty("--orider-host-safe-bottom", `${session.safeInsets.bottom}px`);
}

function AuthorizedSurface({
  activityId,
  bridge,
  retryKey,
  services,
  session,
  surfaceKind,
}: {
  activityId?: string;
  bridge: EmbeddedBridge;
  retryKey: number;
  services: FirebaseServices;
  session: AcceptedSession;
  surfaceKind: EmbeddedSurfaceKind;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
  }));
  const user = services.auth.currentUser;

  useEffect(() => {
    if (!user) return undefined;
    setProfileLoading(true);
    return onSnapshot(
      doc(services.firestore, "users", user.uid),
      (snapshot) => {
        setProfile(snapshot.exists() ? snapshot.data() as UserProfile : null);
        setProfileLoading(false);
      },
      () => {
        setProfile(null);
        setProfileLoading(false);
        bridge.send("surface.error", { code: "profile_load_failed" });
      },
    );
  }, [bridge, services.firestore, user]);

  const logout = useCallback(async () => {
    await signOut(services.auth);
  }, [services.auth]);
  const authValue = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    profileLoading,
    loading: false,
    signInWithGoogle: async () => {},
    logout,
  }), [logout, profile, profileLoading, user]);

  useEffect(() => {
    void i18n.changeLanguage(session.locale);
    document.documentElement.lang = session.locale;
  }, [session.locale]);

  if (profileLoading) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading profile">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  return (
    <FirebaseServicesProvider services={services}>
      <AuthContextProvider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider userId={null} profile={{ ...profile, locale: session.locale }}>
            <Suspense fallback={(
              <div className="orider-embedded-status" role="status" aria-label="Loading surface">
                <div className="orider-embedded-status__pulse" />
              </div>
            )}>
              {surfaceKind === "activity-analysis" && activityId ? (
                <ActivityAnalysisSurface
                  activityId={activityId}
                  retryKey={retryKey}
                  onReady={() => bridge.send("surface.ready", { activityId })}
                  onError={(code) => bridge.send("surface.error", { code })}
                />
              ) : surfaceKind === "fitness" ? (
                <FitnessSurface
                  key={retryKey}
                  retryKey={retryKey}
                  onReady={() => bridge.send("surface.ready", {})}
                  onError={(code) => bridge.send("surface.error", { code })}
                />
              ) : surfaceKind === "plan" ? (
                <PlanSurface
                  key={retryKey}
                  retryKey={retryKey}
                  onReady={() => bridge.send("surface.ready", {})}
                  onError={(code) => bridge.send("surface.error", { code })}
                />
              ) : null}
            </Suspense>
          </LocaleProvider>
        </QueryClientProvider>
      </AuthContextProvider>
    </FirebaseServicesProvider>
  );
}

export default function EmbeddedBootstrapRoot({
  bridgeFactory = () => createEmbeddedBridge(createWebViewTransport()),
  surfaceKind = "activity-analysis",
}: EmbeddedBootstrapRootProps) {
  const { activityId } = useParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [bridge] = useState(bridgeFactory);
  const [session, setSession] = useState<AcceptedSession | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const authorizedUid = useRef<string | null>(null);
  const acceptedUid = useRef<string | null>(null);
  const authorizationAttempt = useRef(0);
  const embedded = initEmbeddedFirebase();
  const services = useMemo<FirebaseServices>(() => ({
    auth: embedded.auth,
    firestore: embedded.firestore,
    functions: embedded.functions,
    ensureAppCheckReady: ensureEmbeddedAppCheckReady,
  }), [embedded.auth, embedded.firestore, embedded.functions]);

  const safeSend = useCallback((
    type: Parameters<EmbeddedBridge["send"]>[0],
    payload: unknown,
    requestId?: string,
  ) => {
    try {
      bridge.send(type, payload, requestId);
    } catch {
      // Native transport availability is non-sensitive; never log message payloads.
    }
  }, [bridge]);

  const handleNavigation = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    let destination: URL;
    try {
      destination = new URL(anchor.href, window.location.href);
    } catch {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (destination.origin === window.location.origin) {
      safeSend("navigation.openNative", {
        path: `${destination.pathname}${destination.search}${destination.hash}`,
      });
    } else if (destination.protocol === "https:" || destination.protocol === "http:") {
      safeSend("navigation.openExternal", { url: destination.toString() });
    }
  }, [safeSend]);

  useEffect(() => {
    const handleMessage = (message: HostBridgeEnvelope) => {
      if (message.type === "host.authorize") {
        const authorization = parseAuthorizePayload(message.payload);
        if (!authorization) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        const attempt = authorizationAttempt.current + 1;
        authorizationAttempt.current = attempt;
        authorizedUid.current = null;
        acceptedUid.current = null;
        setSession(null);
        void consumeAppHandoffCode({
          auth: services.auth,
          functions: services.functions,
          ensureAppCheckReady: services.ensureAppCheckReady,
        }).then(() => services.auth.authStateReady()).then(() => {
          if (authorizationAttempt.current !== attempt) return;
          const uid = services.auth.currentUser?.uid ?? null;
          authorizedUid.current = uid === authorization.expectedUid ? uid : null;
          safeSend("auth.state", { uid }, message.requestId);
        }).catch(() => {
          if (authorizationAttempt.current !== attempt) return;
          authorizedUid.current = null;
          safeSend("auth.state", { uid: null }, message.requestId);
        });
        return;
      }

      if (message.type === "host.sessionAccepted") {
        const accepted = parseAcceptedSession(message.payload);
        const currentUid = services.auth.currentUser?.uid ?? null;
        if (!accepted) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        if (!authorizedUid.current || authorizedUid.current !== currentUid) {
          setSession(null);
          safeSend("surface.error", { code: "auth_uid_mismatch" }, message.requestId);
          return;
        }
        if (rootRef.current) applyHostContract(rootRef.current, accepted);
        acceptedUid.current = currentUid;
        setSession(accepted);
        return;
      }

      if (message.type === "host.sessionRejected") {
        if (!isRecord(message.payload) || !hasOnlyKeys(message.payload, ["reason"])) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        setSession(null);
        authorizedUid.current = null;
        acceptedUid.current = null;
        return;
      }

      if (message.type === "host.lifecycle") {
        if (!isLifecyclePayload(message.payload)) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
        }
        return;
      }

      if (!isEmptyPayload(message.payload)) {
        safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
        return;
      }
      if (message.type === "host.retry") {
        setRetryKey((key) => key + 1);
      } else if (message.type === "host.logout") {
        authorizationAttempt.current += 1;
        authorizedUid.current = null;
        acceptedUid.current = null;
        setSession(null);
        void signOut(services.auth);
      }
    };

    const unsubscribe = bridge.subscribe(handleMessage);
    const unsubscribeAuth = onAuthStateChanged(services.auth, (user) => {
      const lockedUid = acceptedUid.current;
      if (!lockedUid || user?.uid === lockedUid) return;
      authorizationAttempt.current += 1;
      acceptedUid.current = null;
      authorizedUid.current = null;
      setSession(null);
      safeSend("surface.error", { code: "auth_uid_changed" });
    });
    safeSend("bootstrap.ready", { contractVersion: CONTRACT_VERSION });
    return () => {
      unsubscribe();
      unsubscribeAuth();
      bridge.dispose();
    };
  }, [bridge, safeSend, services]);

  return (
    <div
      ref={rootRef}
      className="orider-embedded-root"
      data-testid="embedded-bootstrap-root"
      onClickCapture={handleNavigation}
    >
      {session && (surfaceKind !== "activity-analysis" || activityId) ? (
        <AuthorizedSurface
          activityId={activityId}
          bridge={bridge}
          retryKey={retryKey}
          services={services}
          session={session}
          surfaceKind={surfaceKind}
        />
      ) : (
        <div className="orider-embedded-status" role="status" aria-label="Waiting for host authorization">
          <div className="orider-embedded-status__pulse" />
        </div>
      )}
    </div>
  );
}

export const embeddedContractTestApi = {
  parseAcceptedSession,
  parseAuthorizePayload,
};
