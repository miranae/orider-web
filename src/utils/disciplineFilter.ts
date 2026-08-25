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
 * **미지 종목은 `null`** — 요가·근력·테니스 등은 추적 3종목이 아니다. 호출자는 배지·라벨을
 * 숨기거나 판정을 건너뛴다. 이전에는 `"bike"` 로 폴백해 **요가 활동에 자전거 배지가**
 * 붙었다.
 */
export function getDiscipline(type?: string): SportDiscipline | null {
  return disciplineOfType(type);
}

/** Discipline → CSS variable color */
/** 표시 헬퍼 4종은 `null`(추적 3종목 아님)을 중립값으로 렌더한다 — 사이클로 보이면 안 된다. */
export function getDisciplineColor(d: Discipline | null): string {
  if (d == null || d === "tri") return "var(--ink-1)";
  if (d === "run") return "var(--amber)";
  if (d === "swim") return "var(--lime)";
  return "var(--aqua)";
}

/** Discipline → i18n 키 (common 네임스페이스). 소비처에서 t(...)로 번역. */
export function getDisciplineLabelKey(d: Discipline | null): string {
  if (d == null) return "common:discipline.other";
  if (d === "tri") return "common:discipline.tri";
  if (d === "run") return "common:discipline.run";
  if (d === "swim") return "common:discipline.swim";
  return "common:discipline.bike";
}

/** Discipline → icon */
export function getDisciplineIcon(d: Discipline | null): string {
  if (d == null) return "🏅";
  if (d === "tri") return "🔺";
  if (d === "run") return "🏃";
  if (d === "swim") return "🏊";
  return "🚴";
}

/** Discipline → English label */
export function getDisciplineTag(d: Discipline | null): string {
  if (d == null) return "OTHER";
  if (d === "tri") return "TRI";
  if (d === "run") return "RUN";
  if (d === "swim") return "SWIM";
  return "RIDE";
}
