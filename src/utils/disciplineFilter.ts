import type { Activity } from "@shared/types";
import {
  disciplineOfType,
  matchesDiscipline,
  type SportDiscipline,
} from "@shared/sport/discipline";

export type Discipline = "tri" | "bike" | "run" | "swim";


export function getDisciplineFromUrl(): Discipline {
  const params = new URLSearchParams(window.location.search);
  const sport = params.get("sport");
  if (sport === "run") return "run";
  if (sport === "swim") return "swim";
  return "bike";
}

export function filterByDiscipline(activities: Activity[], discipline: Discipline): Activity[] {
  // `"tri"` 는 기존 동작(typeSet 삼항의 else 분기 = 사이클)을 그대로 보존한다.
  // `FitnessPage` 는 호출 전에 tri 를 자체 분기하고(`discipline === "tri" ? activities : …`)
  // `DashboardPage` 는 이 함수에 tri 를 그대로 넘긴다 — 즉 화면마다 tri 의 의미가 다르다.
  // 여기서 통일하면 대시보드 동작이 조용히 바뀌므로 이 트랙 범위 밖으로 남긴다.
  const axis: SportDiscipline = discipline === "tri" ? "bike" : discipline;
  return activities.filter((a) => matchesDiscipline(a.type, axis));
}

/**
 * Activity type → discipline. 판정은 `@shared/sport/discipline` 정본.
 *
 * ⚠️ **미지 종목을 `"bike"` 로 폴백한다** — 호출자 다수가 non-null `Discipline` 을
 * 기대하므로(배지 표시·분석 이벤트·평균속도 타당성) 폴백을 남겼다. 즉 요가·근력 활동에
 * 자전거 배지가 붙는 문제는 남아 있다. 제거는 호출지점별 null 처리 설계가 선행돼야 한다.
 *
 * 이 교체로 해소된 것: 부분 문자열 매칭(`VirtualRowing` 이 러닝으로 걸리던 것),
 * 그리고 서버와의 종목표 불일치. 미상 여부가 필요하면 `getDisciplineOrNull` 을 쓴다.
 */
export function getDiscipline(type?: string): Discipline {
  return disciplineOfType(type) ?? "bike";
}

/** 판정 정본 그대로 — 미지 종목은 `null`(추적 3종목 아님). */
export function getDisciplineOrNull(type?: string): SportDiscipline | null {
  return disciplineOfType(type);
}

/** Discipline → CSS variable color */
export function getDisciplineColor(d: Discipline): string {
  if (d === "tri") return "var(--ink-1)";
  if (d === "run") return "var(--amber)";
  if (d === "swim") return "var(--lime)";
  return "var(--aqua)";
}

/** Discipline → i18n 키 (common 네임스페이스). 소비처에서 t(...)로 번역. */
export function getDisciplineLabelKey(d: Discipline): string {
  if (d === "tri") return "common:discipline.tri";
  if (d === "run") return "common:discipline.run";
  if (d === "swim") return "common:discipline.swim";
  return "common:discipline.bike";
}

/** Discipline → icon */
export function getDisciplineIcon(d: Discipline): string {
  if (d === "tri") return "🔺";
  if (d === "run") return "🏃";
  if (d === "swim") return "🏊";
  return "🚴";
}

/** Discipline → English label */
export function getDisciplineTag(d: Discipline): string {
  if (d === "tri") return "TRI";
  if (d === "run") return "RUN";
  if (d === "swim") return "SWIM";
  return "RIDE";
}
