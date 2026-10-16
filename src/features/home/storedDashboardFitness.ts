import type { UserFitness } from "@shared/types";
import type { Discipline } from "../../utils/disciplineFilter";

export interface DashboardFitness { ctl: number; atl: number; tsb: number }

/** 현재 부하는 서버의 확정 스냅샷만 읽는다. 미완료·누락을 0으로 합성하지 않는다. */
export function selectStoredDashboardFitness(fitness: UserFitness | null, discipline: Discipline): DashboardFitness | null {
  if (!fitness) return null;
  const lifecycle = fitness as UserFitness & { state?: unknown; processingState?: unknown; disciplineStates?: Partial<Record<"bike" | "run" | "swim", unknown>> };
  const aggregateReady = lifecycle.state === "final" && lifecycle.processingState === "processed";
  if (discipline === "tri" ? !aggregateReady
    : lifecycle.disciplineStates ? lifecycle.disciplineStates[discipline] !== "final" : !aggregateReady) return null;
  const value = discipline === "tri"
    ? { ctl: fitness.totalCTL, atl: fitness.totalATL, tsb: fitness.totalTSB }
    : fitness.breakdown?.[discipline];
  return value && [value.ctl, value.atl, value.tsb].every(Number.isFinite)
    ? { ctl: value.ctl, atl: value.atl, tsb: value.tsb } : null;
}
