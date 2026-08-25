/**
 * 활동 `type`(Strava `sport_type`) → 종목 축(discipline) 판정 정본.
 *
 * 활동 문서의 `type` 은 Strava `sport_type` 어휘를 쓴다 — Strava 동기화는 원값을 그대로
 * 저장하고, 앱 업로드·헬스 인입·파일 임포트는 그 어휘에 맞춰 값을 파생한다. 이 모듈은
 * 반대 방향, 즉 저장된 `type` 을 집계·필터용 종목 축으로 되돌리는 판정을 한 곳에 모은다.
 *
 * ## 두 가지 규칙
 *
 * 1. **정확 일치만** — 부분 문자열 매칭을 쓰지 않는다. 이전 구현은 substring 이라
 *    `VirtualRowing` 이 러닝(`run`)에, `Workout` 이 사이클에 걸렸다. 새 종목은 이 표에
 *    명시적으로 추가한다.
 * 2. **미지 값은 `null`** — 사이클이 아니다. 이전 구현은 표에 없는 모든 `sport_type` 을
 *    사이클로 떨어뜨려, 요가·근력·테니스·로잉 등이 사이클로 라벨링됐다. 호출자는 `null` 을
 *    "추적 3종목 중 어느 것도 아님"으로 다뤄 집계에서 제외한다.
 *
 * ## 트레킹·걷기
 *
 * `Hike`·`Walk` 는 러닝 축에 유지한다. 별도 축을 만들지 않고 `null` 로 빼지도 않는다.
 *
 * ## 동기화
 *
 * 이 표는 서버 분석 파이프라인과 **같은 값이어야 한다** — 어긋나면 같은 활동이 화면과
 * 서버에서 다른 종목이 된다. 표를 고칠 때는 서버 쪽 사본도 같은 시점에 고친다.
 */

/** 추적하는 종목 축. 이 셋 중 어느 것도 아닌 활동은 `null` 로 판정된다. */
export type SportDiscipline = "bike" | "run" | "swim";

/**
 * Strava `sport_type`(소문자 정규화) → 종목 축.
 *
 * 값은 Strava 의 `SportType` enum 과 과거 `ActivityType` enum 을 합친 것이다. 표에 없는
 * 값은 의도적으로 비워 둔다 — 매핑되지 않은 운동이 특정 종목의 부하로 새는 것보다
 * 어느 집계에도 들어가지 않는 편이 정확하다.
 */
export const SPORT_TYPE_DISCIPLINE: Readonly<Record<string, SportDiscipline>> = {
  // ── 사이클 ────────────────────────────────────────────────
  ride: "bike",
  virtualride: "bike",
  ebikeride: "bike",
  emountainbikeride: "bike",
  gravelride: "bike",
  mountainbikeride: "bike",
  handcycle: "bike",
  velomobile: "bike",
  velolift: "bike", // 자사 레거시 값

  // ── 러닝 (+ 트레킹·걷기, 소유자 결정에 따라 러닝 축) ──────
  run: "run",
  virtualrun: "run",
  trailrun: "run",
  hike: "run",
  walk: "run",

  // ── 수영 ──────────────────────────────────────────────────
  swim: "swim",
  // 하위 종목 — 부분 문자열 시절 `"swim"` 포함으로 잡히던 값들이다. 정확 일치로
  // 바꾸면서 빠뜨리면 오픈워터·수영장 활동이 수영 축에서 사라진다.
  openwaterswim: "swim",
  poolswim: "swim",

  // ── 레거시·비-Strava 별칭 ──────────────────────────────────
  // 공개 API(`api/services/dto.ts`)가 계약으로 받아 온 값들이다. 운영 데이터
  // 전수 조사(2026-08-25)에서는 나타나지 않았으나, 계약 회귀를 만들지 않기 위해
  // 정본 표에 그대로 흡수한다.
  cycling: "bike",
  "e-bike ride": "bike",
  running: "run",
  swimming: "swim",
};

/**
 * 활동 `type` → 종목 축. **미지 값·부재는 `null`**(추적 3종목 아님).
 *
 * `null` 을 사이클로 폴백하지 않는 것이 이 함수의 계약이다. 호출자는 `null` 을 집계에서
 * 제외한다 — 사이클 부하로 세지 않는다.
 */
export function disciplineOfType(type: unknown): SportDiscipline | null {
  if (typeof type !== "string") return null;
  const normalized = type.trim().toLowerCase();
  if (normalized.length === 0) return null;
  return SPORT_TYPE_DISCIPLINE[normalized] ?? null;
}

/** 활동 `type` 이 주어진 종목 축에 속하는지. 필터 호출지점용. */
export function matchesDiscipline(type: unknown, discipline: SportDiscipline): boolean {
  return disciplineOfType(type) === discipline;
}

/**
 * 추적 3종목 중 어느 것도 아닌지 — 요가·근력·테니스·로잉 등.
 *
 * 이름을 따로 둔 이유: 호출지점에서 `=== null` 을 읽으면 "판정 실패"로 오해하기 쉬운데,
 * 실제 의미는 "판정 성공했고 결과가 우리 3종목이 아니다" 다.
 */
export function isUntrackedDiscipline(type: unknown): boolean {
  return disciplineOfType(type) === null;
}
