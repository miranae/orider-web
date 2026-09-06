/**
 * canonical 봉투 → 화면 상태 (#884 — 에픽 app#2237 의 I).
 *
 * ## 왜 별도 파일인가
 *
 * `canonical.ts` 는 `orider-g1-web` 원본의 **사본**이고 `scripts/check-canonical-contract.mjs`
 * 가 드리프트를 막는다. 표시 규칙은 서버 계약이 아니라 클라이언트 규칙이라 그 사본에
 * 끼워 넣으면 원본과 갈라진다 — 그래서 여기에 따로 둔다.
 *
 * ## 이 규칙은 앱과 손으로 맞춘 사본이다
 *
 * 원본은 앱의 `shared/.../canonical/CanonicalConsumption.kt` 이고, 언어가 달라 코드를
 * 공유할 수 없다. 아래 표는 그 파일의 `canonicalDisplayFor` 와 **같은 답을 내야 한다.**
 * 한쪽만 고치면 같은 계정·같은 기간에서 웹과 앱이 다른 화면을 보여준다.
 * 드리프트 방지는 `check-canonical-contract.mjs` 의 표 앵커가 맡는다.
 */
import { validateCanonicalEnvelope, type CanonicalEnvelope, type CanonicalStatus } from "./canonical";

export const CANONICAL_DISPLAYS = [
  /** 값을 그대로 보여준다. */
  "value",
  /** 값은 있지만 최신이 아니다 — 값 + 안내를 함께 보여준다. */
  "value_with_stale_hint",
  /** 아직 계산 중이다. **숫자를 그리지 않는다.** */
  "loading",
  /** 계산에 실패했다. 재시도 여지를 알린다. */
  "error",
  /** 계산해 줄 값 자체가 없다(활동 없음 등). */
  "empty",
] as const;

export type CanonicalDisplay = (typeof CANONICAL_DISPLAYS)[number];

/**
 * 상태와 "쓸 수 있는 값이 손에 있는가" 로 화면 상태를 정한다.
 *
 * `hasCachedValue` 는 **직전에 성공한 값**이 있는지다. 그게 있으면 실패·계산중에도
 * 화면을 비우지 않고 값 + 안내를 보여주는 편이 낫다 — 사용자에겐 "기록이 사라졌다"
 * 가 가장 나쁜 오해다.
 *
 * 어떤 경우에도 **0 을 만들어 내지 않는다.** 미계산·실패를 0 으로 그리는 것이 이
 * 전환이 없애려는 결함 그 자체다.
 */
export function canonicalDisplayFor(
  status: CanonicalStatus,
  hasCachedValue: boolean,
): CanonicalDisplay {
  switch (status) {
    case "canonical":
      return "value";
    case "stale":
      return "value_with_stale_hint";
    // 계산 중이라도 예전 값이 있으면 숨기지 않는다 — 빈 화면보다 낡은 값이 낫다.
    case "processing":
      return hasCachedValue ? "value_with_stale_hint" : "loading";
    // 실패는 캐시가 있어도 알린다. 조용히 낡은 값을 최신처럼 보여주면 안 된다.
    case "failed":
      return "error";
    case "unavailable":
      return "empty";
  }
}

/** 이 상태에서 숫자를 그려도 되는가. */
export function canonicalDisplayShowsValue(display: CanonicalDisplay): boolean {
  return display === "value" || display === "value_with_stale_hint";
}

export interface CanonicalRenderDecision {
  display: CanonicalDisplay;
  /** 비어 있지 않으면 서버가 계약을 어겼다. 로그로 남긴다. */
  contractViolations: string[];
}

/**
 * 서버 응답을 받아 화면 상태를 정한다. 계약 위반 응답은 **그리지 않는다.**
 *
 * 서버가 계약을 어긴 응답(예: `unavailable` 인데 값이 실려 있음)을 그대로 그리면 이
 * 에픽이 고친 문제가 형태만 바꿔 돌아온다. 위반이면 `error` 로 떨어뜨리고 위반 내용을
 * 함께 돌려줘 로그로 남길 수 있게 한다.
 */
export function decideCanonicalRender<T>(
  envelope: CanonicalEnvelope<T>,
  hasCachedValue: boolean,
): CanonicalRenderDecision {
  const violations = validateCanonicalEnvelope(envelope);
  if (violations.length > 0) {
    return { display: "error", contractViolations: violations };
  }
  return { display: canonicalDisplayFor(envelope.status, hasCachedValue), contractViolations: [] };
}
