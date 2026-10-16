import type { Activity } from "@shared/types";
import { acceptedActivityLoad, type AcceptedActivityLoad } from "@shared/training/acceptedActivityLoad";
import { isSaneTss, TIME_FACTORS, type LoadDiscipline } from "@shared/training/activityLoad";
import { disciplineOfType } from "@shared/sport/discipline";
import { acceptedTrainingActivities, sumActivityTss } from "./estimateTSS";

export type WeeklyLoadBasis = "power" | "heartRate" | "time" | "unknown" | "excluded";
export type WeeklyLoadBasisTotals = Record<Exclude<WeeklyLoadBasis, "excluded">, number>;

export type WeeklyLoadInput =
  | { kind: "time"; durationMillis: number; factor: number }
  | { kind: "streamTrimpTss" | "relativeEffort"; value: number };

export interface WeeklyLoadEvidenceRow {
  activityId: string;
  /** 사용자 원문. 용어 치환이나 추정 이름을 넣지 않는다. */
  title: string;
  startTime: number;
  discipline: LoadDiscipline;
  source: AcceptedActivityLoad["source"];
  /** 원래 산출 방식이 확인된 경우만 분류한다. 저장된 값의 주변 지표로 역추정하지 않는다. */
  basis: WeeklyLoadBasis;
  value: number | null;
  /** 명시적인 0이 선택되어 부하는 알지만 추정 부하로 표기하지 않는 경우. */
  knownZero?: boolean;
  /** 이 화면에서 실제 선택한 계산 입력만 제공. 저장·서버 값의 원시 입력은 알 수 없다. */
  input?: WeeklyLoadInput;
}

export interface WeeklyLoadEvidence {
  periodStartMs: number;
  /** 주간 구간은 시작 포함, 끝 제외. */
  periodEndMs: number;
  scope: LoadDiscipline | "allSupported";
  timeZone: string;
  coverage: "loading" | "ready" | "partial" | "error";
  total: number | null;
  estimated: boolean;
  /** 저장·서버에 게시된 부하 합계. 실측 여부를 의미하지 않는다. */
  storedTotal: number;
  estimatedTotal: number;
  /** 산입된 활동별 반올림 값의 합계. 값이 미확인인 행은 숫자 합계에 넣지 않는다. */
  basisTotals: WeeklyLoadBasisTotals;
  rawCount: number;
  acceptedCount: number;
  duplicateCount: number;
  contributingCount: number;
  storedCount: number;
  estimatedCount: number;
  unknownCount: number;
  knownZeroCount: number;
  /** 미미한 기록으로 부하가 제외된 대표 활동 수. */
  excludedCount: number;
  unsupportedOrDeletedCount: number;
  rows: WeeklyLoadEvidenceRow[];
}

interface WeeklyLoadEvidenceOptions {
  periodStartMs: number;
  periodEndMs: number;
  scope: WeeklyLoadEvidence["scope"];
  timeZone?: string;
  coverage: WeeklyLoadEvidence["coverage"];
  /** 전체 조회 범위에서 먼저 정한 대표. 주 경계의 연동 중복을 두 번 산입하지 않는다. */
  acceptedActivities?: readonly Activity[];
}

/** 홈의 FTP 미사용 accepted-load 경로를 그대로 설명한다. 별도 TSS 계산식을 만들지 않는다. */
export function buildWeeklyLoadEvidence(activities: readonly Activity[], options: WeeklyLoadEvidenceOptions): WeeklyLoadEvidence {
  const inPeriod = (activity: Activity) => activity.startTime >= options.periodStartMs && activity.startTime < options.periodEndMs;
  const raw = activities.filter(inPeriod);
  const accepted = (options.acceptedActivities ?? acceptedTrainingActivities(activities)).filter(inPeriod);
  const load = sumActivityTss(accepted);
  const rows: WeeklyLoadEvidenceRow[] = accepted.flatMap(activity => {
    const discipline = disciplineOfType(activity.type);
    if (!discipline) return [];
    const selected = acceptedActivityLoad(activity as unknown as Record<string, unknown>, discipline);
    const summary = activity.summary as (Activity["summary"] & { movingTimeMillis?: number }) | null | undefined;
    const explicitZero = (activity as Activity & { tss?: unknown }).tss === 0 || summary?.tss === 0;
    const knownZero = selected.known && selected.value === 0 && selected.source === "time" && explicitZero;
    // backend analysis/activity-derived-load.ts는 실측 NP가 양수이며 가상 파워가 아닌 경우에만
    // serverDerivedLoad.streamTss를 게시한다. 원래 NP·FTP 등 계산 수치는 이 문서에 게시되지 않는다.
    const basis: WeeklyLoadBasis = selected.source === "excluded" ? "excluded"
      : selected.source === "server" || selected.source === "power_estimate" ? "power"
      : selected.source === "trimp" ? "heartRate"
      : selected.source === "time" && !knownZero ? "time" : "unknown";
    let input: WeeklyLoadInput | undefined;
    if (selected.source === "time" && !knownZero) {
      const durationMillis = typeof summary?.ridingTimeMillis === "number" ? summary.ridingTimeMillis
        : typeof summary?.movingTimeMillis === "number" ? summary.movingTimeMillis
        : typeof summary?.elapsedTimeMillis === "number" ? summary.elapsedTimeMillis : 0;
      input = { kind: "time", durationMillis, factor: TIME_FACTORS[discipline] };
    } else if (selected.source === "trimp") {
      if (isSaneTss(summary?.streamTrimpTss)) input = { kind: "streamTrimpTss", value: summary.streamTrimpTss };
      else if (isSaneTss(summary?.relativeEffort)) input = { kind: "relativeEffort", value: summary.relativeEffort };
    }
    return [{ activityId: activity.id, title: activity.description ?? "", startTime: activity.startTime,
      discipline, source: selected.source, basis, value: selected.known ? selected.value : null,
      ...(knownZero ? { knownZero: true } : {}), ...(input ? { input } : {}) }];
  });
  const basisTotals = rows.reduce<WeeklyLoadBasisTotals>((totals, row) => {
    if (row.basis !== "excluded" && row.value !== null) totals[row.basis] += row.value;
    return totals;
  }, { power: 0, heartRate: 0, time: 0, unknown: 0 });
  const stored = rows.filter(row => row.source === "server" || row.source === "recorded");
  const estimated = rows.filter(row => !row.knownZero && (row.source === "time" || row.source === "trimp" || row.source === "power_estimate"));
  const unsupportedOrDeletedCount = raw.filter(activity => !disciplineOfType(activity.type)
    || Boolean((activity as Activity & { deletedAt?: unknown }).deletedAt)).length;
  const excludedCount = rows.filter(row => row.source === "excluded").length;
  return {
    periodStartMs: options.periodStartMs, periodEndMs: options.periodEndMs, scope: options.scope,
    timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, coverage: options.coverage,
    total: load.value, estimated: load.estimated, basisTotals,
    storedTotal: stored.reduce((sum, row) => sum + (row.value ?? 0), 0),
    estimatedTotal: estimated.reduce((sum, row) => sum + (row.value ?? 0), 0),
    rawCount: raw.length, acceptedCount: accepted.length,
    duplicateCount: raw.length - unsupportedOrDeletedCount - accepted.length,
    contributingCount: rows.filter(row => row.value !== null && row.source !== "excluded").length,
    storedCount: stored.length, estimatedCount: estimated.length, unknownCount: load.unknownCount,
    knownZeroCount: rows.filter(row => row.knownZero).length, excludedCount, unsupportedOrDeletedCount, rows,
  };
}
