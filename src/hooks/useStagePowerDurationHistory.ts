import { useEffect, useRef, useState } from "react";
import type { StagePowerHistoryCandidate, StagePowerHistoryComputeResponse, StagePowerHistoryPageResponse, StagePowerHistoryRange, StagePowerHistorySession } from "@shared/types/stage-power-duration-history";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
import { computeStagePowerHistory, loadStagePowerHistoryPage, stagePowerHistoryCandidateReady, validStagePowerHistorySelection, STAGE_POWER_HISTORY_MEMORY_LIMIT } from "../services/stagePowerDurationHistory";
interface Period { page: StagePowerHistoryPageResponse | null; candidates: StagePowerHistoryCandidate[]; scanned: number }
interface State { generation: number; session: StagePowerHistorySession | null; periods: Period[]; computed: StagePowerHistoryComputeResponse[]; busy: boolean; failure: "source_changed" | "generic" | null }
export function parseHistoryDuration(value: string): number | null {
  if (/^\d+$/u.test(value)) { const seconds = Number(value); return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 604800 ? seconds : null; }
  const match = /^(\d+):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match || Number(match[2]) >= 60 || match[3] !== undefined && Number(match[3]) >= 60) return null;
  const seconds = match[3] === undefined ? Number(match[1]) * 60 + Number(match[2]) : Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 604800 ? seconds : null;
}
export function useStagePowerDurationHistory(ownerUid: string, ranges: readonly StagePowerHistoryRange[], draft: string, unit: "W" | "W/kg") {
  const { user } = useAuth(), services = useFirebaseServices();
  const owner = user?.uid === ownerUid && !user.isAnonymous;
  const available = owner && stageActivityPowerAvailable() && validStagePowerHistorySelection({ unit: "W", durationSeconds: 1, periods: ranges.map(v => ({ ...v })), periodIndex: 0 });
  const durationSeconds = parseHistoryDuration(draft);
  const identity = JSON.stringify([available ? ownerUid : null, ranges, draft]);
  const context = useRef({ identity, services, generation: 0, unit, unitGeneration: 0, busy: false });
  const [state, setState] = useState<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services) context.current = { identity, services, generation: context.current.generation + 1, unit, unitGeneration: context.current.unitGeneration + 1, busy: false };
  if (context.current.unit !== unit) { context.current.unit = unit; context.current.unitGeneration++; }
  useEffect(() => () => { context.current.generation++; context.current.busy = false; }, []);
  const current = state?.generation === context.current.generation ? state : null;
  const empty = (): State => ({ generation: context.current.generation, session: null, periods: ranges.map(() => ({ page: null, candidates: [], scanned: 0 })), computed: [], busy: false, failure: null });
  const action = async (kind: "start" | "next" | "compute", periodIndex: number, selectedIds: string[] = []) => {
    if (!available || durationSeconds === null || context.current.busy || !Number.isSafeInteger(periodIndex) || periodIndex < 0 || periodIndex >= ranges.length) return;
    if (kind !== "start" && (!current?.session || current.failure === "source_changed")) return;
    const old = kind === "start" && (current?.failure || current?.periods[periodIndex]?.page) ? empty() : current ?? empty();
    const period = old.periods[periodIndex]!;
    if (kind !== "compute" && old.periods.reduce((n, p) => n + p.scanned, 0) + 20 > STAGE_POWER_HISTORY_MEMORY_LIMIT) return;
    if (kind === "next" && (!period.page?.page.nextCursor || period.page.page.exhausted || old.periods.reduce((n, p) => n + p.scanned, 0) + 20 > STAGE_POWER_HISTORY_MEMORY_LIMIT)) return;
    const candidates = period.candidates.filter(v => selectedIds.includes(v.activityId));
    if (kind === "compute" && (candidates.length < 1 || candidates.length > 2 || candidates.length !== selectedIds.length || candidates.some(v => !stagePowerHistoryCandidateReady(v)))) return;
    const capture = { generation: context.current.generation, unitGeneration: context.current.unitGeneration };
    const active = () => capture.generation === context.current.generation && capture.unitGeneration === context.current.unitGeneration;
    context.current.busy = true; setState({ ...old, busy: true, failure: null });
    const selection = { unit: "W" as const, durationSeconds, periods: ranges.map(v => ({ ...v })), periodIndex, includeWeightNormalized: true };
    try {
      if (kind === "compute") {
        const response = await computeStagePowerHistory(services, ownerUid, { ...selection, mode: "stage_power_duration_history_compute", session: old.session!, candidates });
        if (active()) {
          const existing = old.computed.filter(v => v.periodIndex === periodIndex).flatMap(v => v.candidates);
          for (const row of response.candidates) {
            const prior = existing.find(v => v.activityId === row.activityId);
            if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw Error("history_source_changed");
          }
          const computed = [...old.computed, response];
          if (computed.reduce((n, v) => n + v.candidates.length, 0) > STAGE_POWER_HISTORY_MEMORY_LIMIT) throw Error("history_memory_cap");
          setState({ ...old, computed, busy: false, failure: null });
        }
      } else {
        const page = await loadStagePowerHistoryPage(services, ownerUid, { ...selection, mode: "stage_power_duration_history_page", ...(old.session ? { session: old.session } : {}), ...(kind === "next" ? { cursor: period.page!.page.nextCursor! } : {}) });
        if (active()) {
          const map = new Map(period.candidates.map(v => [v.activityId, v]));
          for (const row of page.activities) { const prior = map.get(row.activityId); if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw Error("history_source_changed"); map.set(row.activityId, row); }
          const periods = old.periods.map((v, i) => i === periodIndex ? { page, candidates: [...map.values()], scanned: period.scanned + page.page.scannedActivityCount } : v);
          if (periods.reduce((n, p) => n + p.scanned, 0) > STAGE_POWER_HISTORY_MEMORY_LIMIT || periods.reduce((n, p) => n + p.candidates.length, 0) > STAGE_POWER_HISTORY_MEMORY_LIMIT) throw Error("history_memory_cap");
          setState({ ...old, session: page.session, periods, busy: false, failure: null });
        }
      }
    } catch (error) {
      if (active()) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        const sourceChanged = code === "functions/failed-precondition" || code === "failed-precondition" || error instanceof Error && error.message === "history_source_changed";
        setState({ ...old, computed: [], busy: false, failure: sourceChanged ? "source_changed" : "generic" });
      }
    } finally {
      if (capture.generation === context.current.generation) { context.current.busy = false; setState(v => v?.generation === capture.generation ? { ...v, busy: false } : v); }
    }
  };
  return { owner, available, durationSeconds, periods: current?.periods ?? ranges.map(() => ({ page: null, candidates: [], scanned: 0 })), computed: current?.computed ?? [], canStart: (i: number) => !!current?.failure || !!current?.periods[i]?.page || (current?.periods.reduce((n, p) => n + p.scanned, 0) ?? 0) + 20 <= STAGE_POWER_HISTORY_MEMORY_LIMIT, canNext: (i: number) => !!current?.periods[i]?.page?.page.nextCursor && current.periods.reduce((n, p) => n + p.scanned, 0) + 20 <= STAGE_POWER_HISTORY_MEMORY_LIMIT, busy: current?.busy ?? false, failure: current?.failure ?? null,
    start: (i: number) => action("start", i), next: (i: number) => action("next", i), calculate: (i: number, ids: string[]) => action("compute", i, ids) };
}
