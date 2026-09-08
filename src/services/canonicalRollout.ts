/**
 * 서버 전환 판정(rollout / kill switch) reader (#2442 — 에픽 app#2237 의 R).
 *
 * 서버는 `config/canonicalRollout` 문서로 화면(surface)마다 코호트·allowUids·killSwitch 를
 * 들고 있고(`functions/src/canonical-rollout-config.ts`), callable `getCanonicalRollout` 이
 * **이 사용자에게** 각 화면이 켜졌는지만 boolean 으로 내려준다. 클라이언트는 코호트 계산을
 * 다시 하지 않는다 — 두 곳에서 판정하면 kill switch 를 내려도 한쪽이 계속 켜져 있다.
 *
 * ## 절대 던지지 않는다 · fail-closed
 *
 * 실패·미로그인·모양 불일치는 모두 **전부 꺼짐**이다. 켜진 쪽으로 기울면 설정 조회 장애
 * 하나가 전량 전환이 된다. 서버(`readCanonicalRolloutEnabled`)와 같은 기본값이다.
 *
 * ## 캐시에는 수명이 있다 (kill switch 가 열린 탭에 닿아야 한다)
 *
 * 판정은 자주 바뀌지 않으므로 uid 별로 캐시하지만 **영구 캐시는 아니다.** 세션 내내 들고
 * 있으면 서버에서 `killSwitch: true` 로 뒤집어도 이미 열려 있는 탭에는 영원히 닿지 않는다 —
 * 사고 대응 수단이 새로고침을 강요하는 순간 수단이 아니다. 그래서 성공한 판정에도
 * [CANONICAL_ROLLOUT_CACHE_TTL_MS] 만큼의 수명을 준다. 실패한 응답은 여전히 캐시하지 않는다 —
 * 일시적인 네트워크 실패가 세션 내내 화면을 끄면 안 된다.
 *
 * ## 게이트 계층 자체의 스위치
 *
 * `canonicalRolloutEnabled`(빌드/런타임 플래그)가 꺼져 있으면 **서버에 묻지 않는다.**
 * callable 이 배포되기 전에 물으면 fail-closed 가 정상 화면을 끄기 때문이다. 서버 배포 뒤에
 * 켜는 것이 순서다.
 */
import { httpsCallable } from "firebase/functions";

import { auth, ensureAppCheckReady, functions } from "./firebase";
import { debugLog, logClientError } from "./errorLogger";
import { getRuntimeConfig } from "./runtimeConfig";

/**
 * 전환 단위가 되는 화면.
 *
 * @sync-with orider-g1-web/functions/src/canonical-rollout-config.ts#CANONICAL_ROLLOUT_SURFACES
 * 앞의 세 면은 서버 원본과 같은 이름이고, 뒤의 네 면(stage 4)은 `config/canonicalConsumers.ts`
 * 의 빌드 플래그와 1:1 이다. 모르는 이름이 내려오면 무시된다(꺼짐).
 */
export const CANONICAL_ROLLOUT_SURFACES = [
  "activityDetail",
  "trainingDecision",
  "homeSummary",
  "weather",
  "course",
  "maintenance",
  "milestones",
] as const;

export type CanonicalRolloutSurface = (typeof CANONICAL_ROLLOUT_SURFACES)[number];
export type CanonicalRolloutSurfaces = Record<CanonicalRolloutSurface, boolean>;

/** 아무것도 켜지 않는 판정. 실패·미로그인·문서 없음이 전부 여기로 온다. */
export function canonicalRolloutAllOff(): CanonicalRolloutSurfaces {
  return Object.fromEntries(
    CANONICAL_ROLLOUT_SURFACES.map((surface) => [surface, false]),
  ) as CanonicalRolloutSurfaces;
}

/** 게이트 계층 스위치. 꺼져 있으면 서버에 묻지 않는다. */
export function canonicalRolloutGateEnabled(): boolean {
  return getRuntimeConfig().canonicalRolloutEnabled === true;
}

/** 켜짐은 boolean `true` 만 인정한다. `"true"` 같은 문자열은 서버 실수이므로 꺼짐이다. */
export function parseCanonicalRolloutSurfaces(value: unknown): CanonicalRolloutSurfaces {
  const record = value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const surfaces = record.surfaces != null && typeof record.surfaces === "object"
    ? (record.surfaces as Record<string, unknown>)
    : {};
  return Object.fromEntries(
    CANONICAL_ROLLOUT_SURFACES.map((surface) => [surface, surfaces[surface] === true]),
  ) as CanonicalRolloutSurfaces;
}

/**
 * 캐시된 판정의 수명. **kill switch 가 열린 탭에 닿기까지의 최악 지연이 이 값이다** —
 * 사고 대응 시간 예산이지 성능 튜닝 값이 아니다. 60초는 "설정을 뒤집고 1분 안에 전부 멈춘다"
 * 를 약속할 수 있는 값이면서, 화면마다 매 렌더 callable 을 때리지 않을 만큼은 길다.
 * 짧게 줄이면 callable 호출량이 그만큼 늘고, 늘리면 사고 대응이 그만큼 느려진다.
 *
 * 훅([useCanonicalRollout])은 이 값을 주기 갱신 간격으로도 쓴다 — 캐시 수명보다 긴 주기로
 * 갱신하면 약속한 지연을 못 지킨다.
 */
export const CANONICAL_ROLLOUT_CACHE_TTL_MS = 60_000;

interface CachedVerdict {
  surfaces: CanonicalRolloutSurfaces;
  /** `Date.now()` 기준. 지나면 캐시가 아니라 없는 것으로 본다. */
  expiresAt: number;
}

/** uid → 성공한 판정. 세션 동안, 그리고 TTL 동안만 산다. */
const rolloutCache = new Map<string, CachedVerdict>();

/**
 * 이번 세션에서 **성공한 판정이 "꺼짐" 이라고 말한** 면.
 *
 * 캐시(TTL)와 달리 만료도, 실패로 인한 삭제도 없다. 다음 **성공한** 판정이 그 면을 켜 줄
 * 때만 지워진다. 이유는 두 가지다.
 *
 * 1. **재조회 실패가 차단을 풀면 안 된다.** 서버가 껐다고 답한 뒤 TTL 재조회가 네트워크
 *    오류로 실패하면 `ok: false` 가 되는데, 그때 "판정을 못 받았다" 로 취급하는 소비처
 *    (공개 뷰어 경로)가 차단을 풀고 다시 그리기 시작했다 — kill switch 를 내렸는데 장애
 *    한 번에 되살아난다 (#2237 리뷰).
 * 2. **로그아웃으로 빠져나갈 수 없어야 한다.** callable `getCanonicalRollout` 은 인증을
 *    요구하므로(`orider-g1-web/functions/src/canonical-rollout-callable.ts`) 미로그인
 *    방문자에게는 판정 자체가 없다. 이 기록이 있으면 같은 탭에서 로그아웃해도 꺼짐이 남는다.
 *
 * **한계(정책 (a)):** 처음부터 끝까지 로그인하지 않은 방문자에게는 kill switch 가 닿지
 * 않는다 — 그에게는 판정을 물을 인증된 경로가 없고, 공개 설정을 인증 없이 읽는 경로를
 * 새로 만드는 것은 서버 계약을 지어내는 일이다. 그 방문자가 보는 것은 서버가 이미
 * 공개용으로 파생해 둔 문서(`activity_metrics_public`)뿐이다. 전량 정지가 필요하면 서버
 * 쪽에서 그 projection 쓰기를 멈추는 것이 실제 수단이다.
 *
 * 기록은 면 단위이고 계정 단위가 아니다 — **막는 방향으로만** 쓰이므로 남의 판정으로 남의
 * 값을 그리는 일은 생기지 않는다. 계정 전환 자체는 `useCanonicalRollout` 이 "판정 전" 으로
 * 처리한다.
 */
const observedOffSurfaces = new Set<CanonicalRolloutSurface>();

/** 이번 세션에서 이 면이 꺼짐으로 판정된 적이 있는가. 실패·미로그인이 이 답을 바꾸지 않는다. */
export function canonicalRolloutObservedOff(surface: CanonicalRolloutSurface): boolean {
  return observedOffSurfaces.has(surface);
}

/** 성공한 판정만 기록을 바꾼다. 켜짐이면 지우고(차단 해제), 꺼짐이면 남긴다. */
function recordObservedVerdict(surfaces: CanonicalRolloutSurfaces): void {
  for (const surface of CANONICAL_ROLLOUT_SURFACES) {
    if (surfaces[surface]) observedOffSurfaces.delete(surface);
    else observedOffSurfaces.add(surface);
  }
}

/**
 * 캐시만 만료시킨다(기록은 남긴다). TTL 이 지난 뒤의 재조회를 실제 경로로 재현하려면
 * 필요하다 — 캐시를 지워 버리면 세션 기록까지 함께 사라져 sticky 를 검증할 수 없다.
 */
export function expireCanonicalRolloutCacheForTests(): void {
  for (const cached of rolloutCache.values()) cached.expiresAt = 0;
}

export function resetCanonicalRolloutCacheForTests(): void {
  rolloutCache.clear();
  observedOffSurfaces.clear();
}

export interface CanonicalRolloutResult {
  surfaces: CanonicalRolloutSurfaces;
  /** 서버 판정을 실제로 받았는가. false 면 fail-closed 기본값이다 — 캐시하지 않는다. */
  ok: boolean;
}

/**
 * 이 사용자의 화면별 전환 판정. 던지지 않는다 — 실패는 전부 꺼짐이다.
 */
export async function fetchCanonicalRollout(
  expectedUid: string,
): Promise<CanonicalRolloutResult> {
  if (auth.currentUser?.uid !== expectedUid) {
    return { surfaces: canonicalRolloutAllOff(), ok: false };
  }
  try {
    await ensureAppCheckReady();
    const callable = httpsCallable<Record<string, never>, unknown>(functions, "getCanonicalRollout");
    const response = await callable({});
    // 응답을 기다리는 동안 계정이 바뀌면 남의 판정을 쓰지 않는다.
    if (auth.currentUser?.uid !== expectedUid) {
      return { surfaces: canonicalRolloutAllOff(), ok: false };
    }
    const surfaces = parseCanonicalRolloutSurfaces(response.data);
    // 꺼짐은 세션에 기록한다 — 이후 재조회가 실패해도, 로그아웃해도 차단이 유지된다.
    recordObservedVerdict(surfaces);
    // 부작용 있는 읽기는 결과를 남긴다 — 어떤 판정으로 그렸는지 없으면 화면 불일치를 못 쫓는다.
    debugLog("canonicalRollout.read", { surfaces });
    return { surfaces, ok: true };
  } catch (error) {
    logClientError("fetchCanonicalRollout", error, { uid: expectedUid });
    return { surfaces: canonicalRolloutAllOff(), ok: false };
  }
}

/**
 * uid 별 판정. 캐시가 살아 있으면(TTL 이내) 그것을, 아니면 서버에 다시 묻는다.
 * 실패는 캐시하지 않는다 — 일시적인 장애가 세션 내내 화면을 끄면 안 된다.
 *
 * 이름의 "Once" 는 **TTL 창 안에서 한 번**이라는 뜻이다. 영구 캐시였을 때는 서버에서 kill
 * switch 를 내려도 이미 열린 탭이 계속 켜져 있었다 (#2237 리뷰).
 */
export async function loadCanonicalRolloutOnce(
  uid: string,
): Promise<CanonicalRolloutResult> {
  const cached = rolloutCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return { surfaces: cached.surfaces, ok: true };
  }
  const result = await fetchCanonicalRollout(uid);
  if (result.ok) {
    rolloutCache.set(uid, {
      surfaces: result.surfaces,
      expiresAt: Date.now() + CANONICAL_ROLLOUT_CACHE_TTL_MS,
    });
  } else {
    // 만료된 채로 남겨 두면 다음 호출이 또 캐시를 뒤진다. 실패 시엔 아예 지운다.
    rolloutCache.delete(uid);
  }
  return result;
}
