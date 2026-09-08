/**
 * canonical 응답 공통 계약 (#2434 — 에픽 miranae/orider-g1-app#2237 의 C).
 *
 * ⚠️ **이 파일은 사본이다.** 원본은 `orider-g1-web/shared/types/canonical.ts` 다.
 * 두 저장소의 `shared/` 는 현재 게이트 없이 손 미러링되고 있어(#889) 한쪽만 고치면
 * 조용히 갈라진다. 이 계약만이라도 갈라지지 않게 `scripts/check-canonical-contract.mjs`
 * 가 wire 값과 불변식 앵커를 검사한다 — 저장소 경계를 넘어 원본을 읽을 수 없으므로
 * 값을 검사 스크립트에 고정하는 방식이다(app#2240 의 Kotlin 미러와 같은 접근).
 *
 * 이 에픽의 목적은 **실제 0 과 미계산·지연·실패를 구분**하는 것이다. 그래서 이 계약의
 * 가장 중요한 규칙은 하나다:
 *
 *   > 데이터 없음이나 서버 실패를 0 으로 대체하지 않는다. `data` 는 `null` 이지 0 이 아니다.
 *
 * ## 왜 새 어휘를 만들지 않았나
 *
 * 이 저장소에는 이미 **운영 중인** 읽기 상태 어휘가 있다 —
 * `functions/src/analysis/activity-metrics-read-resolver.ts` 의
 * `status: "final" | "pending" | "invalid"` + `stale: boolean`. 프로덕션 9곳 이상이 쓴다.
 *
 * 에픽 본문은 5상태(`processing`/`canonical`/`stale`/`failed`/`unavailable`)를 규정하지만,
 * 그것을 **기존 어휘와 무관하게** 도입하면 계산 정본이 셋으로 갈라진다 — 이 에픽이 없애려는
 * 바로 그 드리프트다(app#2238 ADR §8.1). 그래서 이 모듈은 **두 어휘의 매핑을 정본으로
 * 고정**하고, wire 형식만 5상태로 통일한다.
 *
 * 기존 설계가 더 나은 지점도 있다: `status=final` + `stale=true` 는 **값을 계속 주면서
 * 낡았음을 알린다**(last-known-good). 5상태에서 `stale` 을 상태값으로 두면 값과 낡음을
 * 동시에 표현하지 못하므로, 이 계약은 `stale` 에서도 `data` 를 채운다(§불변식 참조).
 */

/** 이 봉투 형식의 버전. 형식이 바뀌면 올린다(값 계산 로직 버전은 `algorithmVersion`). */
export const CANONICAL_SCHEMA_VERSION = 1;

/**
 * canonical 응답 상태.
 *
 * - `canonical`   — 값이 최신이고 신뢰 가능
 * - `stale`       — 값은 있으나 낡음(재계산 중이거나 입력이 바뀜). **last-known-good 을 준다**
 * - `processing`  — 계산 중이고 아직 줄 값이 없음
 * - `failed`      — 계산이 실패함
 * - `unavailable` — 계산 대상이 아님(입력 없음, 권한 없음, 익명 사용자)
 */
export const CANONICAL_STATUSES = [
  "canonical",
  "stale",
  "processing",
  "failed",
  "unavailable",
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

/**
 * 기간. **반개구간 `[start, end)`** 로 고정한다.
 *
 * `rule` 은 rolling 과 calendar 를 **분리**한다 — 같은 화면에서 두 규칙을 섞으면 두 값이
 * 서로 다른 기간을 재고, 차이는 화면에서만 드러난다(app#2238 ADR §4.4).
 */
export interface CanonicalPeriod {
  /** 포함(inclusive) 경계. epoch ms. */
  start: number;
  /** 배제(exclusive) 경계. epoch ms. */
  end: number;
  /** IANA 타임존. calendar 규칙의 경계를 정한다. 예: "Asia/Seoul". */
  timezone: string;
  /** 이 기간을 계산한 기준 시각. 진행 중인 오늘을 포함하는지 판단에 쓴다. */
  asOf: number;
  rule: "rolling" | "calendar";
  /** calendar 규칙일 때의 단위. rolling 이면 생략한다. */
  unit?: "day" | "week" | "month" | "year";
}

export interface CanonicalError {
  /** 기계가 분기할 코드. 사람이 읽는 문장을 코드로 쓰지 말 것. */
  code: string;
  /** 재시도로 해결될 수 있는가. 클라이언트의 재시도·안내 분기 기준. */
  retryable: boolean;
  message?: string;
}

/**
 * canonical 응답 봉투.
 *
 * `data` 는 status 에 따라 `null` 일 수 있다. **null 을 0 으로 바꾸지 말 것** — 그 치환이
 * 이 에픽이 고치려는 결함의 정체다.
 */
export interface CanonicalEnvelope<T> {
  schemaVersion: number;
  /** 값을 만든 계산 로직의 버전. 같은 입력이라도 이 값이 다르면 값이 다를 수 있다. */
  algorithmVersion: string;
  status: CanonicalStatus;
  /** 값을 계산한 시각. 값이 없으면 null. */
  computedAt: number | null;
  /** 입력의 revision. 같은 revision 이면 재처리·순서 변화에도 같은 값이어야 한다(멱등). */
  inputRevision: string | null;
  /** 입력 내용의 해시. revision 이 같아도 내용이 바뀐 경우를 잡는다. */
  inputDigest: string | null;
  /** 기간 스코프 응답만 채운다(Home·Fitness). 활동 단위 응답은 null. */
  period: CanonicalPeriod | null;
  data: T | null;
  error: CanonicalError | null;
}

/** 운영 중인 read-resolver 어휘. `activity-metrics-read-resolver.ts` 와 같아야 한다. */
export interface LegacyReadState {
  status: "final" | "pending" | "invalid";
  stale: boolean;
  /** last-known-good 값이 있는가. `pending` 을 processing 과 stale 로 가르는 기준이다. */
  hasValue: boolean;
}

/**
 * 기존 3상태(+stale) → canonical 5상태.
 *
 * `pending` 이 두 갈래로 갈리는 것이 핵심이다 — 줄 값이 있으면 `stale`(last-known-good),
 * 없으면 `processing`. 이 구분이 없으면 "계산 중" 과 "계산 중이지만 예전 값은 있음" 이
 * 같은 상태가 되고, 클라이언트는 보여줄 수 있는 값을 숨기게 된다.
 */
export function canonicalStatusFromLegacy(legacy: LegacyReadState): CanonicalStatus {
  if (legacy.status === "invalid") return "failed";
  if (legacy.status === "pending") return legacy.hasValue ? "stale" : "processing";
  // final
  return legacy.stale ? "stale" : "canonical";
}

/** 문서·입력이 아예 없을 때. 0 이 아니라 `unavailable` 이다. */
export function canonicalStatusForMissingInput(): CanonicalStatus {
  return "unavailable";
}

/**
 * 봉투 불변식. 계약 테스트와 라우트가 같은 규칙을 본다.
 *
 * 위반 메시지 목록을 돌려준다(빈 배열 = 정합).
 */
export function validateCanonicalEnvelope<T>(envelope: CanonicalEnvelope<T>): string[] {
  const errors: string[] = [];
  const { status, data, computedAt, error, period } = envelope;

  if (!CANONICAL_STATUSES.includes(status)) {
    errors.push(`status 가 허용값이 아니다: ${String(status)}`);
  }
  if (envelope.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    errors.push(`schemaVersion 이 ${CANONICAL_SCHEMA_VERSION} 이어야 한다 (현재 ${envelope.schemaVersion})`);
  }
  if (!envelope.algorithmVersion) {
    errors.push("algorithmVersion 이 비어 있다 — 값이 어느 로직에서 나왔는지 추적할 수 없다");
  }

  // 값을 주는 상태는 값과 계산 시각을 함께 줘야 한다.
  if ((status === "canonical" || status === "stale") && data === null) {
    errors.push(`status=${status} 는 값을 줘야 한다 — stale 은 last-known-good 을 준다`);
  }
  if ((status === "canonical" || status === "stale") && computedAt === null) {
    errors.push(`status=${status} 인데 computedAt 이 없다`);
  }

  // 값이 없는 상태는 0 이 아니라 null 이어야 한다. 이 계약의 존재 이유다.
  if ((status === "processing" || status === "unavailable") && data !== null) {
    errors.push(`status=${status} 는 data 가 null 이어야 한다 — 0 으로 대체하지 않는다`);
  }
  if (status === "failed" && error === null) {
    errors.push("status=failed 인데 error 가 없다 — 실패 이유를 알 수 없다");
  }
  if (status !== "failed" && error !== null) {
    errors.push(`status=${status} 인데 error 가 있다 — 실패가 아닌 응답에 오류를 담지 않는다`);
  }

  if (period !== null) {
    if (!(period.start < period.end)) {
      errors.push(`period 는 반개구간 [start, end) 이므로 start < end 여야 한다 (${period.start}, ${period.end})`);
    }
    if (!period.timezone) {
      errors.push("period.timezone 이 비어 있다 — calendar 경계를 정할 수 없다");
    }
    if (period.rule === "calendar" && !period.unit) {
      errors.push("period.rule=calendar 인데 unit 이 없다");
    }
    if (period.rule === "rolling" && period.unit) {
      errors.push("period.rule=rolling 에는 unit 을 쓰지 않는다 — 두 규칙을 섞지 않는다");
    }
  }

  return errors;
}
