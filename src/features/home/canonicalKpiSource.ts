/**
 * 정본 봉투 → 홈 KPI 한 칸이 무엇을 그릴지 (#2237).
 *
 * 화면 쪽 분기를 한 곳으로 모은다. KPI 칸마다 조건을 따로 쓰면 어느 한 칸이 미계산을
 * 0 으로 그리는 결함이 되돌아온다 — 그게 이 에픽이 없애려는 것이다.
 *
 * 규칙:
 *  - 전환이 꺼져 있으면 `client` — 화면은 **오늘과 똑같이** 클라 집계를 그린다(회귀 없음).
 *  - 값이 보이는 상태(`value`/`value_with_stale_hint`)이고 값이 손에 있으면 `server`.
 *    `stale` 이면 값 옆에 칩을 붙인다 — 낡은 값을 최신인 척 그리지 않는다.
 *  - 그 밖의 모든 상태(계산 중·실패·값 없음, 그리고 "켜졌는데 아직 응답 전")는 `state` 다.
 *    **숫자를 그리지 않는다.** 0 도, 클라 집계도 아니다 — 클라 집계로 조용히 되돌아가면
 *    사용자는 서버가 멈춘 것을 영영 모른다.
 */
import { canonicalDisplayShowsValue, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import type { CanonicalHomeTotals } from "../../services/canonicalApi";

/** 숫자 없는 상태에서 쓰는 안내 문구 키(`dashboard:canonical.*`). */
export type CanonicalKpiNoteKey = "pending" | "failed" | "empty";

export type CanonicalKpiSource<T> =
  | { kind: "client" }
  | { kind: "server"; values: T; stale: boolean }
  | { kind: "state"; noteKey: CanonicalKpiNoteKey };

export function canonicalKpiSource<T>(
  enabled: boolean,
  display: CanonicalDisplay | null,
  values: T | null,
): CanonicalKpiSource<T> {
  if (!enabled) return { kind: "client" };
  // 켜졌지만 아직 응답 전. 클라 집계로 그렸다가 서버 값으로 튀지 않게 여기서 잡는다.
  if (display === null) return { kind: "state", noteKey: "pending" };
  if (canonicalDisplayShowsValue(display) && values !== null) {
    return { kind: "server", values, stale: display === "value_with_stale_hint" };
  }
  if (display === "error") return { kind: "state", noteKey: "failed" };
  if (display === "empty") return { kind: "state", noteKey: "empty" };
  // loading, 그리고 "값이 보이는 상태인데 값이 없는" 계약 위반도 여기로 온다 — 0 을 만들지 않는다.
  return { kind: "state", noteKey: "pending" };
}

/** KPI 한 칸이 상태별로 쓰는 문구. 호출부가 번역을 넣어 준다. */
export interface CanonicalKpiNotes {
  /** 값이 보일 때의 기본 서브 문구(예: "최근 7일"). */
  value: string;
  pending: string;
  failed: string;
  empty: string;
  /** 값 옆 칩 문구(낡은 집계 표식). */
  staleChip: string;
}

export interface CanonicalKpiPresentation {
  /** false 면 숫자 자리에 "—" 가 온다. 0 을 그리지 않는다. */
  showNumbers: boolean;
  sub: string;
  chip: string | null;
}

/**
 * 출처 → 화면 속성. `client`(전환 꺼짐)와 `server`(값 있음)는 둘 다 숫자를 그리고,
 * 다른 점은 칩뿐이다 — 전환이 꺼져 있으면 칩도 없다(오늘과 똑같은 화면).
 */
export function canonicalKpiPresentation<T>(
  source: CanonicalKpiSource<T>,
  notes: CanonicalKpiNotes,
): CanonicalKpiPresentation {
  if (source.kind === "state") {
    return { showNumbers: false, sub: notes[source.noteKey], chip: null };
  }
  return {
    showNumbers: true,
    sub: notes.value,
    chip: source.kind === "server" && source.stale ? notes.staleChip : null,
  };
}

/** 화면이 쓰는 최근 7일 네 숫자. 단위는 클라 집계(`useWeeklyStats.thisWeek`)와 같다. */
export interface HomeWeekTotals {
  rides: number;
  /** 미터. 표시 단위(km·mi) 변환은 formatter 한 곳에서만 한다. */
  distance: number;
  /** 밀리초. h:m 변환은 formatter 한 곳에서만 한다. */
  time: number;
  /** 미터. */
  elevation: number;
}

/**
 * 정본 합계 → 화면 이름. **여기서 단위를 바꾸지 않는다** — 서버가 이미 미터·밀리초로 주고,
 * 클라 집계도 같은 단위라 두 출처가 같은 formatter 를 지난다. 예전에는 이 자리에서 ×1000 을
 * 했다(웹이 km·초로 잘못 선언해서) — 실제 응답에서는 그 곱이 NaN 을 만들었다 (#2237 리뷰).
 */
export function canonicalWeekTotals(totals: CanonicalHomeTotals): HomeWeekTotals {
  return {
    rides: totals.activityCount,
    distance: totals.distanceMeters,
    time: totals.movingMillis,
    elevation: Math.round(totals.elevationGainMeters),
  };
}
