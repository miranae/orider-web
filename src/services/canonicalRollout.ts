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
 * ## 세션당 한 번
 *
 * 판정은 uid 별로 바뀌지 않으므로 uid 마다 한 번만 부른다. 실패한 응답은 캐시하지 않는다 —
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

/** uid → 성공한 판정. 세션 동안만 산다. */
const rolloutCache = new Map<string, CanonicalRolloutSurfaces>();

export function resetCanonicalRolloutCacheForTests(): void {
  rolloutCache.clear();
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
    // 부작용 있는 읽기는 결과를 남긴다 — 어떤 판정으로 그렸는지 없으면 화면 불일치를 못 쫓는다.
    debugLog("canonicalRollout.read", { surfaces });
    return { surfaces, ok: true };
  } catch (error) {
    logClientError("fetchCanonicalRollout", error, { uid: expectedUid });
    return { surfaces: canonicalRolloutAllOff(), ok: false };
  }
}

/**
 * uid 당 한 번만 부른다. 실패는 캐시하지 않는다 — 일시적인 장애가 세션 내내 화면을 끄면 안 된다.
 */
export async function loadCanonicalRolloutOnce(
  uid: string,
): Promise<CanonicalRolloutSurfaces> {
  const cached = rolloutCache.get(uid);
  if (cached) return cached;
  const result = await fetchCanonicalRollout(uid);
  if (result.ok) rolloutCache.set(uid, result.surfaces);
  return result.surfaces;
}
