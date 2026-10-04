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
import { logClientError } from "../services/errorLogger";
import {
  embeddedAccountReady,
  ensureEmbeddedAppCheckReady,
  getEmbeddedFirestore,
  initEmbeddedFirebase,
  isolateEmbeddedAccount,
} from "./embeddedFirebase";
import {
  parseSurfaceSelectionMessage,
  RETAINED_SURFACE_SELECTION_CAPABILITY,
  SURFACE_SELECTION_REQUEST_ID_CAPABILITY,
  type TrainingSurfaceKind,
} from "./surfaceSelection";
import "./embedded.css";
import {
  createRunStartChannel,
  parseRunStartResult,
  RUN_START_SCHEDULED_CAPABILITY,
  type RunStartChannel,
} from "./runStartBridge";
import {
  clearTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
} from "./trainingSurfaceCache";

const ActivityAnalysisSurface = lazy(() => import("./surfaces/ActivityAnalysisSurface"));
const FitnessSurface = lazy(() => import("./surfaces/FitnessSurface"));
const PlanSurface = lazy(() => import("./surfaces/PlanSurface"));

const CONTRACT_VERSION = 1 as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const SUPPORTED_LOCALES = new Set(["ko", "en"]);
const HOST_CAPABILITY = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_HOST_CAPABILITIES = 16;

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
  /** 호스트가 `host.sessionAccepted.capabilities` 로 알린 기능. 없으면 빈 배열(구버전 호스트). */
  hostCapabilities: string[];
}

interface SurfaceLoadingFlow {
  generation: number;
  requestId: string;
  startedAt: number;
  surface: "fitness" | "plan";
  cacheHit: boolean;
  cachedContentReported: boolean;
  /** 이미 준비된 채 숨겨 두었던 표면을 다시 보여 주는 흐름(재마운트 없음). */
  reused: boolean;
}

type TrainingSurfaceStatus = "cached" | "fresh" | "error";

/**
 * 마운트된(숨겨졌을 수 있는) 트레이닝 표면. 호스트가 같은 표면을 다시 고르거나 비활성(null)
 * 선택을 보내도 이 인스턴스를 유지해 Firestore 리스너를 닫았다 다시 열지 않는다.
 */
interface MountedTrainingSurface {
  surface: TrainingSurfaceKind;
  mountKey: number;
  /** 표면이 마지막으로 알린 준비 상태. 아직 없으면 null. */
  lastReady: { status: TrainingSurfaceStatus; contentComplete: boolean } | null;
  /** 숨김 시작 시각(Date.now). 보이는 중이면 null. */
  hiddenAt: number | null;
}

interface SurfaceSelectionState {
  generation: number;
  /** 호스트가 현재 보여 주길 원하는 표면. null 이면 비활성(숨김). */
  surface: TrainingSurfaceKind | null;
  requestId?: string;
  /** 실제로 마운트해 둔 표면. 비활성 동안에도 유지된다. */
  mounted: TrainingSurfaceKind | null;
  mountKey: number;
  /** 이미 준비된 표면을 재사용해 새 requestId 에 즉시 응답해야 하는지. */
  reuseReady: boolean;
}

/**
 * 숨긴 표면을 유지하는 상한. 이보다 오래 숨겨지면 언마운트해 리스너를 놓는다.
 * 탭 왕복·잠깐의 백그라운드(알림 센터·설정 시트)는 대개 수 분 안이라 재사용 이득이 크고,
 * 그보다 오래 비운 화면은 숨긴 채 원격 변경 읽기를 계속 내기보다 다시 열어 일회성
 * 조회(계획 등)를 새로 받는 편이 낫다. 다시 열 때는 trainingSurfaceCache 가 즉시 화면을 채운다.
 */
const HIDDEN_SURFACE_RELEASE_MS = 30 * 60 * 1000;

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
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["theme", "locale", "safeInsets", "capabilities"])) return null;
  let hostCapabilities: string[] = [];
  if (payload.capabilities !== undefined) {
    if (
      !Array.isArray(payload.capabilities)
      || payload.capabilities.length > MAX_HOST_CAPABILITIES
      || !payload.capabilities.every((item) => typeof item === "string" && HOST_CAPABILITY.test(item))
    ) return null;
    hostCapabilities = [...new Set(payload.capabilities as string[])];
  }
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
    hostCapabilities,
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
  mountedTrainingSurface,
  onTrainingShellReady,
  onTrainingSurfaceReady,
  retryKey,
  runStartChannel,
  surfaceMountKey,
  selectionRequestId,
  services,
  session,
  surfaceKind,
  trainingSurfaceVisible,
}: {
  activityId?: string;
  bridge: EmbeddedBridge;
  mountedTrainingSurface: TrainingSurfaceKind | null;
  onTrainingShellReady: () => void;
  onTrainingSurfaceReady: (
    status?: "cached" | "fresh" | "error",
    contentComplete?: boolean,
  ) => void;
  retryKey: number;
  runStartChannel: RunStartChannel;
  surfaceMountKey: number;
  selectionRequestId?: string;
  services: FirebaseServices;
  session: AcceptedSession;
  surfaceKind: EmbeddedSurfaceKind;
  trainingSurfaceVisible: boolean;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const shellStatusRef = useRef<HTMLParagraphElement>(null);
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
  }));
  const user = services.auth.currentUser;
  const trainingSurface = mountedTrainingSurface !== null;
  const trainingShellVisible = trainingSurface && trainingSurfaceVisible;
  const selectionRequestIdRef = useRef(selectionRequestId);
  selectionRequestIdRef.current = selectionRequestId;

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
        bridge.send(
          "surface.error",
          { code: "profile_load_failed" },
          surfaceKind === "activity-analysis" ? undefined : selectionRequestIdRef.current,
        );
      },
    );
  }, [bridge, services.firestore, surfaceKind, user]);

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

  // host 언어를 표면이 마운트되기 전에 적용한다. 마운트 뒤에 바꾸면 언어(t)에 의존하는 활동·
  // 시계열 리스너가 한 번 열렸다 닫히고 다시 열려 첫 로드에 같은 문서를 두 번 읽는다.
  // 첫 적용 이후의 언어 변경은 표면을 내리지 않고 그대로 바꾼다.
  const [initialLocaleApplied, setInitialLocaleApplied] = useState(
    () => i18n.language === session.locale,
  );
  useEffect(() => {
    let cancelled = false;
    document.documentElement.lang = session.locale;
    const markApplied = () => {
      if (!cancelled) setInitialLocaleApplied(true);
    };
    if (i18n.language === session.locale) markApplied();
    // 실패해도 표면은 연다(fail-open) — 다만 원인은 남긴다.
    else void i18n.changeLanguage(session.locale).then(markApplied, (err: unknown) => {
      logClientError("embedded.initialLocale.apply", err, { locale: session.locale });
      markApplied();
    });
    return () => {
      cancelled = true;
    };
  }, [session.locale]);
  const surfaceGateLoading = profileLoading || !initialLocaleApplied;

  useEffect(() => {
    if (!trainingShellVisible) return undefined;
    const frame = window.requestAnimationFrame(() => {
      onTrainingShellReady();
      if (shellStatusRef.current) shellStatusRef.current.hidden = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onTrainingShellReady, trainingShellVisible]);

  if (surfaceGateLoading && !trainingSurface) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading profile">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  const surface = (
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
              ) : mountedTrainingSurface === "fitness" ? (
                <FitnessSurface
                  key={`${surfaceMountKey}:${retryKey}`}
                  retryKey={retryKey}
                  onReady={onTrainingSurfaceReady}
                />
              ) : mountedTrainingSurface === "plan" ? (
                <PlanSurface
                  key={`${surfaceMountKey}:${retryKey}`}
                  retryKey={retryKey}
                  onReady={onTrainingSurfaceReady}
                  scheduledRunStarter={session.hostCapabilities.includes(RUN_START_SCHEDULED_CAPABILITY)
                    ? runStartChannel
                    : null}
                />
              ) : null}
            </Suspense>
          </LocaleProvider>
        </QueryClientProvider>
      </AuthContextProvider>
    </FirebaseServicesProvider>
  );

  if (trainingSurface) {
    const title = session.locale === "en"
      ? mountedTrainingSurface === "fitness" ? "Fitness" : "Plan"
      : mountedTrainingSurface === "fitness" ? "피트니스" : "운동 계획";
    const loadingLabel = session.locale === "en" ? "Loading…" : "불러오는 중…";
    return (
      // 비활성 동안에는 언마운트 대신 숨긴다 — 같은 표면으로 돌아올 때 리스너를 다시 열지 않는다.
      <section
        className="orider-embedded-shell"
        aria-labelledby="orider-training-surface-title"
        hidden={!trainingSurfaceVisible}
      >
        <header className="orider-embedded-shell__header">
          <h1 id="orider-training-surface-title">{title}</h1>
          <p ref={shellStatusRef} role="status">{loadingLabel}</p>
        </header>
        {surfaceGateLoading ? (
          <div className="orider-embedded-status" role="status" aria-label={loadingLabel}>
            <div className="orider-embedded-status__pulse" />
          </div>
        ) : surface}
      </section>
    );
  }

  return surface;
}

export default function EmbeddedBootstrapRoot({
  bridgeFactory = () => createEmbeddedBridge(createWebViewTransport()),
  surfaceKind = "activity-analysis",
}: EmbeddedBootstrapRootProps) {
  const { activityId } = useParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [bridge] = useState(bridgeFactory);
  const [runStartChannel] = useState(() => createRunStartChannel({
    send: (payload, requestId) => bridge.send("run.startScheduled", payload, requestId),
  }));
  const [session, setSession] = useState<AcceptedSession | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const initialTrainingSurface = surfaceKind === "fitness" || surfaceKind === "plan"
    ? surfaceKind
    : null;
  const [surfaceSelection, setSurfaceSelection] = useState<SurfaceSelectionState>({
    generation: 0,
    surface: initialTrainingSurface,
    requestId: undefined,
    mounted: initialTrainingSurface,
    mountKey: 0,
    reuseReady: false,
  });
  const mountedTrainingSurface = useRef<MountedTrainingSurface | null>(
    initialTrainingSurface
      ? { surface: initialTrainingSurface, mountKey: 0, lastReady: null, hiddenAt: null }
      : null,
  );
  const reuseAckGeneration = useRef(-1);
  const authorizedUid = useRef<string | null>(null);
  const acceptedUid = useRef<string | null>(null);
  const sessionAccepted = useRef(false);
  const selectionGeneration = useRef(0);
  const activeSelectionRequestId = useRef<string | undefined>(undefined);
  const authorizationAttempt = useRef(0);
  const surfaceLoadingFlow = useRef<SurfaceLoadingFlow | null>(null);
  const embedded = initEmbeddedFirebase();
  // 브리지·인증 구독은 Firestore 인스턴스와 무관하다. 계정 전환으로 Firestore 가 새로 만들어져도
  // 구독(과 브리지)이 다시 만들어지지 않도록 표면용 services 와 분리한다.
  const controlServices = useMemo(() => ({
    auth: embedded.auth,
    functions: embedded.functions,
    ensureAppCheckReady: ensureEmbeddedAppCheckReady,
  }), [embedded.auth, embedded.functions]);
  const [firestore, setFirestore] = useState(() => embedded.firestore);
  const services = useMemo<FirebaseServices>(
    () => ({ ...controlServices, firestore }),
    [controlServices, firestore],
  );
  // 로그아웃·계정 변경 뒤 이전 계정 데이터를 버리는 요청. 표면이 언마운트된(리스너가 닫힌)
  // 다음 커밋의 effect 에서 처리한다.
  const [accountReleaseRequest, setAccountReleaseRequest] = useState(0);
  useEffect(() => {
    if (accountReleaseRequest === 0) return;
    void isolateEmbeddedAccount(null).then(
      () => setFirestore(getEmbeddedFirestore()),
      // 실패하면 소유 계정이 유지되어 다음 sessionAccepted 가 격리를 다시 시도한다.
      (err: unknown) => logClientError("embedded.accountIsolation.release", err, { phase: "logout" }),
    );
  }, [accountReleaseRequest]);

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

  const handleTrainingShellReady = useCallback((
    surface: TrainingSurfaceKind,
    generation: number,
  ) => {
    if (
      selectionGeneration.current !== generation
      || surfaceSelection.surface !== surface
      || surfaceSelection.generation !== generation
    ) return;
    safeSend("surface.shellReady", {}, surfaceSelection.requestId);
    const flow = surfaceLoadingFlow.current;
    if (!flow || flow.surface !== surface || flow.generation !== generation) return;
    safeSend("telemetry.event", {
      name: "embedded_surface_loading",
      surface: flow.surface,
      elapsedMs: Math.min(120_000, Math.max(0, Math.round(performance.now() - flow.startedAt))),
      loadState: flow.reused ? "warm" : "cold",
      milestone: "shell_visible",
    }, flow.requestId);
  }, [safeSend, surfaceSelection]);

  const handleTrainingSurfaceReady = useCallback((
    surface: TrainingSurfaceKind,
    generation: number,
    requestId: string | undefined,
    status: "cached" | "fresh" | "error" = "fresh",
    contentComplete = true,
  ) => {
    if (
      selectionGeneration.current !== generation
      || surfaceSelection.surface !== surface
      || surfaceSelection.generation !== generation
    ) return;
    const flow = surfaceLoadingFlow.current;
    if (flow && flow.surface === surface && flow.generation === generation) {
      if (status === "cached" && !flow.cacheHit) {
        flow.cacheHit = true;
        const elapsedMs = Math.min(120_000, Math.max(0, Math.round(performance.now() - flow.startedAt)));
        safeSend("telemetry.event", {
          name: "embedded_surface_loading",
          surface: flow.surface,
          elapsedMs,
          loadState: "warm",
          milestone: "cache_hit",
        }, flow.requestId);
      }
      if (status === "cached" && contentComplete && !flow.cachedContentReported) {
        flow.cachedContentReported = true;
        const elapsedMs = Math.min(120_000, Math.max(0, Math.round(performance.now() - flow.startedAt)));
        safeSend("telemetry.event", {
          name: "embedded_surface_loading",
          surface: flow.surface,
          elapsedMs,
          loadState: "warm",
          milestone: "cached_content",
        }, flow.requestId);
      }
      if (status === "fresh" && contentComplete) {
        // 정상 완료 milestone만 trace를 소비한다. 인라인 오류 뒤 같은 셸에서 재시도해
        // 복구되면 최초 탭 진입과 연결된 fresh_complete를 한 번 기록한다.
        surfaceLoadingFlow.current = null;
        safeSend("telemetry.event", {
          name: "embedded_surface_loading",
          surface: flow.surface,
          elapsedMs: Math.min(120_000, Math.max(0, Math.round(performance.now() - flow.startedAt))),
          loadState: flow.cacheHit || flow.reused ? "warm" : "cold",
          milestone: "fresh_complete",
        }, flow.requestId);
      }
    }
    if (status === "error") {
      safeSend("surface.error", { code: "surface_load_failed" }, requestId);
    } else {
      safeSend("surface.ready", {}, requestId);
    }
  }, [safeSend, surfaceSelection]);

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
        sessionAccepted.current = false;
        selectionGeneration.current += 1;
        surfaceLoadingFlow.current = null;
        activeSelectionRequestId.current = undefined;
        setSession(null);
        void consumeAppHandoffCode({
          auth: controlServices.auth,
          functions: controlServices.functions,
          ensureAppCheckReady: controlServices.ensureAppCheckReady,
        }).then(() => controlServices.auth.authStateReady()).then(() => {
          if (authorizationAttempt.current !== attempt) return;
          const uid = controlServices.auth.currentUser?.uid ?? null;
          authorizedUid.current = uid === authorization.expectedUid ? uid : null;
          if (authorizedUid.current === null || controlServices.auth.currentUser?.isAnonymous === true) {
            clearTrainingSurfaceCache();
          }
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
        const currentUid = controlServices.auth.currentUser?.uid ?? null;
        if (!accepted) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        if (!authorizedUid.current || authorizedUid.current !== currentUid) {
          clearTrainingSurfaceCache();
          surfaceLoadingFlow.current = null;
          activeSelectionRequestId.current = undefined;
          setSession(null);
          safeSend("surface.error", { code: "auth_uid_mismatch" }, message.requestId);
          return;
        }
        prepareTrainingSurfaceCacheOwner(currentUid, controlServices.auth.currentUser?.isAnonymous === true);
        if (rootRef.current) applyHostContract(rootRef.current, accepted);
        acceptedUid.current = currentUid;
        sessionAccepted.current = true;
        const generation = selectionGeneration.current + 1;
        selectionGeneration.current = generation;
        activeSelectionRequestId.current = undefined;
        mountedTrainingSurface.current = initialTrainingSurface
          ? { surface: initialTrainingSurface, mountKey: generation, lastReady: null, hiddenAt: null }
          : null;
        setSurfaceSelection({
          generation,
          surface: initialTrainingSurface,
          requestId: undefined,
          mounted: initialTrainingSurface,
          mountKey: generation,
          reuseReady: false,
        });
        surfaceLoadingFlow.current = null;
        if ((surfaceKind === "fitness" || surfaceKind === "plan") && message.requestId) {
          const flow: SurfaceLoadingFlow = {
            generation,
            requestId: message.requestId,
            startedAt: performance.now(),
            surface: surfaceKind,
            cacheHit: false,
            cachedContentReported: false,
            reused: false,
          };
          surfaceLoadingFlow.current = flow;
          safeSend("telemetry.event", {
            name: "embedded_surface_loading",
            surface: flow.surface,
            elapsedMs: 0,
            loadState: "cold",
            milestone: "session_accepted",
          }, flow.requestId);
        }
        // 이전 계정이 쓰던 Firestore 캐시를 다음 계정 표면이 마운트되기 전에 비운다.
        const ready = embeddedAccountReady(currentUid);
        const isolation = isolateEmbeddedAccount(currentUid);
        if (ready) {
          void isolation.catch((err: unknown) => logClientError("embedded.accountIsolation.accept", err, {
            phase: "same_account", uid: currentUid,
          }));
          setSession(accepted);
          return;
        }
        const attempt = authorizationAttempt.current;
        const isCurrentAcceptance = () => authorizationAttempt.current === attempt
          && sessionAccepted.current
          && acceptedUid.current === currentUid;
        void isolation.then(() => {
          if (!isCurrentAcceptance()) return;
          setFirestore(getEmbeddedFirestore());
          setSession(accepted);
        }, (err: unknown) => {
          logClientError("embedded.accountIsolation.accept", err, { phase: "account_switch", uid: currentUid });
          if (!isCurrentAcceptance()) return;
          sessionAccepted.current = false;
          acceptedUid.current = null;
          surfaceLoadingFlow.current = null;
          safeSend("surface.error", { code: "surface_load_failed" }, message.requestId);
        });
        return;
      }

      if (message.type === "host.surfaceSelected") {
        const selection = parseSurfaceSelectionMessage(message);
        if (!selection) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        if (
          surfaceKind === "activity-analysis"
          || !sessionAccepted.current
          || !acceptedUid.current
          || controlServices.auth.currentUser?.uid !== acceptedUid.current
        ) {
          if (acceptedUid.current && controlServices.auth.currentUser?.uid !== acceptedUid.current) {
            clearTrainingSurfaceCache();
          }
          safeSend("surface.error", { code: "invalid_host_state" }, message.requestId);
          return;
        }
        const generation = selectionGeneration.current + 1;
        selectionGeneration.current = generation;
        activeSelectionRequestId.current = selection.requestId;
        // 같은 표면의 재선택·비활성(null)은 마운트를 유지한다. 다른 표면, 오류 상태,
        // 너무 오래 숨겨 둔 표면만 새로 마운트한다(재시도는 retryKey 가 따로 다시 연다).
        const now = Date.now();
        const previous = mountedTrainingSurface.current;
        const retained = previous
          && previous.lastReady?.status !== "error"
          && (previous.hiddenAt === null || now - previous.hiddenAt < HIDDEN_SURFACE_RELEASE_MS)
          ? previous
          : null;
        let next: MountedTrainingSurface | null;
        if (selection.surface === null) {
          next = retained ? { ...retained, hiddenAt: retained.hiddenAt ?? now } : null;
        } else if (retained?.surface === selection.surface) {
          next = { ...retained, hiddenAt: null };
        } else {
          next = { surface: selection.surface, mountKey: generation, lastReady: null, hiddenAt: null };
        }
        mountedTrainingSurface.current = next;
        // 이미 준비를 알린 표면을 다시 보여 주면 표면이 다시 알리지 않으므로 대신 응답한다.
        const reuseReady = selection.surface !== null
          && retained !== null
          && next?.mountKey === retained.mountKey
          && retained.lastReady !== null;
        surfaceLoadingFlow.current = selection.surface && selection.requestId
          ? {
            generation,
            requestId: selection.requestId,
            startedAt: performance.now(),
            surface: selection.surface,
            cacheHit: false,
            cachedContentReported: false,
            reused: reuseReady,
          }
          : null;
        setSurfaceSelection({
          generation,
          surface: selection.surface,
          requestId: selection.requestId,
          mounted: next?.surface ?? null,
          mountKey: next?.mountKey ?? generation,
          reuseReady,
        });
        return;
      }

      if (message.type === "host.sessionRejected") {
        clearTrainingSurfaceCache();
        if (!isRecord(message.payload) || !hasOnlyKeys(message.payload, ["reason"])) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
          return;
        }
        setSession(null);
        setAccountReleaseRequest((request) => request + 1);
        authorizedUid.current = null;
        acceptedUid.current = null;
        sessionAccepted.current = false;
        selectionGeneration.current += 1;
        surfaceLoadingFlow.current = null;
        activeSelectionRequestId.current = undefined;
        return;
      }

      if (message.type === "host.runStartResult") {
        // 대기 중 요청이 없는 응답(시간 초과 뒤 도착 등)은 조용히 버린다.
        if (!runStartChannel.deliver(message) && !parseRunStartResult(message)) {
          safeSend("surface.error", { code: "invalid_host_payload" }, message.requestId);
        }
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
        // 재시도는 표면을 새로 마운트하므로 이전 인스턴스의 준비 상태를 재사용하지 않는다.
        const mounted = mountedTrainingSurface.current;
        if (mounted) mountedTrainingSurface.current = { ...mounted, lastReady: null };
        setRetryKey((key) => key + 1);
      } else if (message.type === "host.logout") {
        clearTrainingSurfaceCache();
        authorizationAttempt.current += 1;
        authorizedUid.current = null;
        acceptedUid.current = null;
        sessionAccepted.current = false;
        selectionGeneration.current += 1;
        surfaceLoadingFlow.current = null;
        activeSelectionRequestId.current = undefined;
        setSession(null);
        setAccountReleaseRequest((request) => request + 1);
        void signOut(controlServices.auth);
      }
    };

    const unsubscribe = bridge.subscribe(handleMessage);
    const unsubscribeAuth = onAuthStateChanged(controlServices.auth, (user) => {
      const lockedUid = acceptedUid.current;
      if (user?.isAnonymous === true) {
        const requestId = activeSelectionRequestId.current;
        clearTrainingSurfaceCache();
        authorizationAttempt.current += 1;
        acceptedUid.current = null;
        authorizedUid.current = null;
        sessionAccepted.current = false;
        selectionGeneration.current += 1;
        surfaceLoadingFlow.current = null;
        activeSelectionRequestId.current = undefined;
        setSession(null);
        setAccountReleaseRequest((request) => request + 1);
        safeSend("surface.error", { code: "auth_uid_changed" }, requestId);
        return;
      }
      if (!lockedUid || user?.uid === lockedUid) return;
      const requestId = activeSelectionRequestId.current;
      clearTrainingSurfaceCache();
      authorizationAttempt.current += 1;
      acceptedUid.current = null;
      authorizedUid.current = null;
      sessionAccepted.current = false;
      selectionGeneration.current += 1;
      surfaceLoadingFlow.current = null;
      activeSelectionRequestId.current = undefined;
      setSession(null);
      setAccountReleaseRequest((request) => request + 1);
      safeSend("surface.error", { code: "auth_uid_changed" }, requestId);
    });
    safeSend("bootstrap.ready", {
      contractVersion: CONTRACT_VERSION,
      capabilities: [
        RETAINED_SURFACE_SELECTION_CAPABILITY,
        SURFACE_SELECTION_REQUEST_ID_CAPABILITY,
        RUN_START_SCHEDULED_CAPABILITY,
      ],
    });
    return () => {
      unsubscribe();
      unsubscribeAuth();
      runStartChannel.dispose();
      bridge.dispose();
    };
  }, [bridge, controlServices, initialTrainingSurface, runStartChannel, safeSend, surfaceKind]);

  const selectedTrainingSurface = surfaceKind === "activity-analysis"
    ? null
    : surfaceSelection.surface;
  const trainingShellReady = useCallback(() => {
    if (!selectedTrainingSurface) return;
    handleTrainingShellReady(selectedTrainingSurface, surfaceSelection.generation);
  }, [handleTrainingShellReady, selectedTrainingSurface, surfaceSelection.generation]);
  const trainingSurfaceReady = useCallback((
    status: "cached" | "fresh" | "error" = "fresh",
    contentComplete = true,
  ) => {
    // 숨긴 동안 도착한 준비도 기록해 둔다 — 같은 표면을 다시 고르면 이 상태로 바로 응답한다.
    const mounted = mountedTrainingSurface.current;
    if (mounted && mounted.mountKey === surfaceSelection.mountKey && mounted.surface === surfaceSelection.mounted) {
      mounted.lastReady = { status, contentComplete };
    }
    if (!selectedTrainingSurface) return;
    handleTrainingSurfaceReady(
      selectedTrainingSurface,
      surfaceSelection.generation,
      surfaceSelection.requestId,
      status,
      contentComplete,
    );
  }, [
    handleTrainingSurfaceReady,
    selectedTrainingSurface,
    surfaceSelection.generation,
    surfaceSelection.mountKey,
    surfaceSelection.mounted,
    surfaceSelection.requestId,
  ]);

  // 재사용한 표면은 이미 준비를 알렸으므로 새 requestId 에 마지막 준비 상태로 대신 응답한다.
  // 응답하지 않으면 호스트의 표면 렌더 제한 시간(10초)이 지나 오류 화면으로 바뀐다.
  useEffect(() => {
    const { generation, requestId, reuseReady, surface } = surfaceSelection;
    if (!reuseReady || !surface || reuseAckGeneration.current === generation) return;
    reuseAckGeneration.current = generation;
    const lastReady = mountedTrainingSurface.current?.lastReady;
    if (!lastReady) return;
    handleTrainingSurfaceReady(surface, generation, requestId, lastReady.status, lastReady.contentComplete);
  }, [handleTrainingSurfaceReady, surfaceSelection]);

  // 숨긴 표면을 상한보다 오래 두지 않는다. 백그라운드에서 타이머가 멈춰도 재선택 시
  // hiddenAt 으로 한 번 더 판정하므로 오래된 표면을 재사용하지 않는다.
  useEffect(() => {
    if (surfaceSelection.surface !== null || surfaceSelection.mounted === null) return undefined;
    const { generation } = surfaceSelection;
    const timer = window.setTimeout(() => {
      if (selectionGeneration.current !== generation) return;
      mountedTrainingSurface.current = null;
      setSurfaceSelection((current) => current.generation === generation
        ? { ...current, mounted: null, reuseReady: false }
        : current);
    }, HIDDEN_SURFACE_RELEASE_MS);
    return () => window.clearTimeout(timer);
  }, [surfaceSelection]);

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
          mountedTrainingSurface={surfaceKind === "activity-analysis" ? null : surfaceSelection.mounted}
          onTrainingShellReady={trainingShellReady}
          onTrainingSurfaceReady={trainingSurfaceReady}
          retryKey={retryKey}
          runStartChannel={runStartChannel}
          surfaceMountKey={surfaceSelection.mountKey}
          selectionRequestId={surfaceSelection.requestId}
          services={services}
          session={session}
          surfaceKind={surfaceKind}
          trainingSurfaceVisible={selectedTrainingSurface !== null}
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
