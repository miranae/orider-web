import { useEffect, useRef, useState } from "react";
import type { ExpandedRunDistanceKey } from "@shared/types/personal-records";
import type { RunEffortStageMutationRequest, RunEffortStageMutationResponse, RunEffortStageOverlay } from "@shared/types/run-effort-stage-preferences";
import type { PowerCurvePeriod } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadTrainingAnalysisPeriods, trainingAnalysisPeriodsAvailable } from "../services/trainingAnalysisPeriods";
import { runEffortStageFailure, runEffortStageOverlaySupported, setRunEffortStagePreference, type RunEffortStageFailure } from "../services/runEffortStagePreferences";

type Result = {
  identity: string;
  generation: number;
  response: TrainingAnalysisPeriodsResponse | null;
  state: "idle" | "loading" | "ready" | "unsupported" | "error" | "mutating";
  action: RunEffortStageMutationRequest | null;
  outcome: RunEffortStageMutationResponse | null;
  failure: RunEffortStageFailure | null;
  cancelledUnknown: boolean;
};
/** 조회·변경은 명시 클릭만 수행한다. effect는 unmount 시 늦은 결과를 차단한다. */
export function useRunEffortStageManagement(ownerUid: string | null | undefined, periods: readonly PowerCurvePeriod[]) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const owner = !!ownerUid && user?.uid === ownerUid && !user.isAnonymous;
  const identity = JSON.stringify([owner ? ownerUid : null, periods]);
  const context = useRef({ identity, services, generation: 0 });
  const inflight = useRef(false);
  if (context.current.identity !== identity || context.current.services !== services) {
    context.current = { identity, services, generation: context.current.generation + 1 };
    inflight.current = false;
  }
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => () => { context.current.generation++; inflight.current = false; }, []);
  const current = result?.identity === identity && result.generation === context.current.generation ? result : null;
  const available = owner && trainingAnalysisPeriodsAvailable();
  const capture = () => ({ identity, services, generation: ++context.current.generation });
  const active = (captured: ReturnType<typeof capture>) => context.current.identity === captured.identity && context.current.services === captured.services && context.current.generation === captured.generation;
  const refresh = async () => {
    if (!available || !ownerUid || inflight.current) return;
    inflight.current = true;
    const captured = capture();
    setResult({ identity, generation: captured.generation, state: "loading", response: null, action: current?.action ?? null, outcome: current?.outcome ?? null, failure: current?.failure ?? null, cancelledUnknown: current?.cancelledUnknown ?? false });
    try {
      const response = await loadTrainingAnalysisPeriods(services, ownerUid, { discipline: "run", includeStageRunEffortPreferences: true, includeExpandedRunDistances: true, periods: periods.map(period => ({ ...period })) });
      if (active(captured)) setResult({ identity, generation: captured.generation, state: runEffortStageOverlaySupported(response) ? "ready" : "unsupported", response: runEffortStageOverlaySupported(response) ? response : null, action: current?.action ?? null, outcome: current?.outcome ?? null, failure: current?.failure ?? null, cancelledUnknown: current?.cancelledUnknown ?? false });
    } catch {
      if (active(captured)) setResult({ identity, generation: captured.generation, state: "error", response: null, action: current?.action ?? null, outcome: current?.outcome ?? null, failure: current?.failure ?? null, cancelledUnknown: current?.cancelledUnknown ?? false });
    } finally { if (active(captured)) inflight.current = false; }
  };
  const submit = async (request: RunEffortStageMutationRequest) => {
    if (!available || !ownerUid || inflight.current) return;
    inflight.current = true;
    const captured = capture();
    setResult({ identity, generation: captured.generation, state: "mutating", response: null, action: request, outcome: null, failure: null, cancelledUnknown: false });
    try {
      const outcome = await setRunEffortStagePreference(services, ownerUid, request);
      if (active(captured)) setResult({ identity, generation: captured.generation, state: "idle", response: null, action: request, outcome, failure: null, cancelledUnknown: false });
    } catch (error) {
      if (active(captured)) setResult({ identity, generation: captured.generation, state: "error", response: null, action: request, outcome: null, failure: runEffortStageFailure(error), cancelledUnknown: false });
    } finally { if (active(captured)) inflight.current = false; }
  };
  const change = (binding: RunEffortStageOverlay["preferenceBindings"][number], target: ExpandedRunDistanceKey, excluded: boolean) => {
    if (current?.state !== "ready" || !current.response || !binding.mutationReady || !binding.metricsRevision || inflight.current || current.action && current.failure) return;
    const genuine = current.response.periods.flatMap(period => period.running?.stageEffortOverlay?.preferenceBindings ?? []).some(value => JSON.stringify(value) === JSON.stringify(binding));
    if (!genuine || binding.excludedTargets.includes(target) === excluded) return;
    void submit({ activityId: binding.activityId, target, excluded, expectedPreferenceRevision: binding.preferenceRevision,
      expectedMetricsRevision: binding.metricsRevision, expectedActivityIncarnation: binding.activityIncarnation, idempotencyKey: crypto.randomUUID() });
  };
  const confirmedOutcome = !!current?.outcome && !!current.response && current.response.periods.some(period => period.running?.stageEffortOverlay?.preferenceBindings.some(binding => binding.activityId === current.outcome!.activityId
    && binding.activityIncarnation === current.outcome!.activityIncarnation && binding.preferenceRevision >= current.outcome!.preferenceRevision
    && binding.mutationReady && binding.excludedTargets.includes(current.outcome!.target) === current.outcome!.excluded));
  const cancelPending = () => {
    if (!current?.action || !current.failure || inflight.current) return;
    const captured = capture();
    setResult({ identity, generation: captured.generation, state: "idle", response: null, action: null, outcome: current.outcome, failure: current.failure, cancelledUnknown: true });
  };
  return { owner, available, confirmedOutcome, cancelPending, pendingRequest: !!current?.action && !!current.failure, cancelledUnknown: current?.cancelledUnknown ?? false, canRetry: !!current?.action && !!current.failure, state: current?.state ?? "idle", response: current?.response ?? null, outcome: current?.outcome ?? null, failure: current?.failure ?? null,
    busy: current?.state === "loading" || current?.state === "mutating", refresh, change,
    retry: () => { if (current?.action && current.failure) void submit(current.action); } };
}
