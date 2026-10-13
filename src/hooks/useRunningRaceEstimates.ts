import { useEffect, useRef, useState } from "react";
import type { StageRaceActivityInput, StageRaceEstimateInputs, StageRaceEstimateRequest, StageRaceEstimateResponse } from "@shared/types/running-race-estimates-stage";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadRunningRaceEstimates, runningRaceEstimatesAvailable } from "../services/runningRaceEstimatesStage";
import { loadTrainingAnalysisPeriods } from "../services/trainingAnalysisPeriods";
export interface RaceActivityChoice { input: StageRaceActivityInput; elapsedSeconds: number; startTime: number }
type Result = { identity: string; generation: number; response: StageRaceEstimateResponse | null; error: boolean; savingUnknown: boolean; storedAccountUnverified: boolean };
type Sources = { identity: string; generation: number; epoch: number; choices: RaceActivityChoice[]; from: number; to: number; partial: boolean; unsupported: boolean };
/** 조회·저장은 명시 조작만 수행한다. 렌더링/입력 변경은 요청을 만들지 않는다. */
export function useRunningRaceEstimates(ownerUid: string, draftKey: string) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const owner = user?.uid === ownerUid && !user.isAnonymous;
  const identity = JSON.stringify([owner ? ownerUid : null, draftKey]);
  const context = useRef({ identity, services, generation: 0, epoch: 0 });
  const sourceContext = useRef({ owner: owner ? ownerUid : null, services, epoch: 0 });
  if (sourceContext.current.owner !== (owner ? ownerUid : null) || sourceContext.current.services !== services) sourceContext.current = { owner: owner ? ownerUid : null, services, epoch: sourceContext.current.epoch + 1 };
  const lock = useRef(false);
  const pendingSave = useRef<{ identity: string; request: Extract<StageRaceEstimateRequest, { mode: "save_snapshot" }> } | null>(null);
  if (context.current.identity !== identity || context.current.services !== services) {
    context.current = { identity, services, generation: context.current.generation + 1, epoch: context.current.epoch + 1 }; lock.current = false;
    if (pendingSave.current?.identity !== identity) pendingSave.current = null;
  }
  const [result, setResult] = useState<Result | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);
  const [busy, setBusy] = useState<{ identity: string; generation: number; mode: string } | null>(null);
  useEffect(() => () => { context.current.generation++; lock.current = false; }, []);
  const current = result?.identity === identity && result.generation === context.current.generation ? result : null;
  const sourceCurrent = owner && sources?.epoch === sourceContext.current.epoch ? sources : null;
  const available = owner && runningRaceEstimatesAvailable();
  const capture = () => ({ identity, services, generation: ++context.current.generation, epoch: context.current.epoch });
  const active = (value: ReturnType<typeof capture>) => context.current.identity === value.identity && context.current.services === value.services && context.current.generation === value.generation;
  const request = async (payload: StageRaceEstimateRequest) => {
    if (!available || lock.current || pendingSave.current && payload !== pendingSave.current.request) return;
    lock.current = true;
    const captured = capture(); setBusy({ identity, generation: captured.generation, mode: payload.mode });
    setResult({ identity, generation: captured.generation, response: null, error: false, savingUnknown: false, storedAccountUnverified: false });
    if (payload.mode === "save_snapshot") pendingSave.current = { identity, request: payload };
    try {
      const response = await loadRunningRaceEstimates(services, ownerUid, payload);
      if (active(captured)) { pendingSave.current = null; setResult({ identity, generation: captured.generation, response, error: false, savingUnknown: false, storedAccountUnverified: false }); }
    } catch (error) {
      const details = error && typeof error === "object" && "details" in error ? error.details as { reason?: unknown; storedOutcome?: unknown } : null;
      if (active(captured)) setResult({ identity, generation: captured.generation, response: null, error: true, savingUnknown: payload.mode === "save_snapshot", storedAccountUnverified: details?.reason === "account_unverified_after_stage_snapshot" && details.storedOutcome === "snapshot_stored" });
    } finally { if (active(captured)) { lock.current = false; setBusy(null); } }
  };
  const discover = async (weeks: 2 | 12 | 24) => {
    if (!available || lock.current || pendingSave.current) return;
    lock.current = true; const captured = capture(); const to = Date.now(), from = to - weeks * 7 * 86_400_000;
    setBusy({ identity, generation: captured.generation, mode: "sources" }); setSources(null); setResult(null);
    try {
      const response = await loadTrainingAnalysisPeriods(services, ownerUid, { discipline: "run", includeExpandedRunDistances: true, includeStageRunEffortPreferences: true, periods: [{ fromInclusive: from, toExclusive: to }] });
      if (!active(captured)) return;
      const period = response.periods[0]!;
      const overlay = period.running?.stageEffortOverlay;
      const choices: RaceActivityChoice[] = [];
      for (const [target, distance] of [["5k", "5km"], ["10k", "10km"], ["half", "half"], ["marathon", "full"]] as const) {
        for (const source of period.running?.expandedDistanceAnalysis?.distances.find(row => row.distance === distance)?.sources ?? []) {
          const binding = overlay?.preferenceBindings.find(row => row.activityId === source.sourceActivityId);
          if (binding?.mutationReady && binding.metricsRevision === source.metricsRevision && !binding.excludedTargets.includes(distance)) choices.push({ elapsedSeconds: source.elapsedSec, startTime: source.startTime,
            input: { activityId: binding.activityId, target, maximalEffortAttested: true, expectedActivityIncarnation: binding.activityIncarnation, expectedMetricsRevision: binding.metricsRevision, expectedPreferenceRevision: binding.preferenceRevision } });
        }
      }
      setSources({ identity, generation: captured.generation, epoch: sourceContext.current.epoch, choices, from, to, partial: period.coverage.truncated || period.status === "partial", unsupported: !overlay || !period.running?.expandedDistanceAnalysis });
    } catch { if (active(captured)) setResult({ identity, generation: captured.generation, response: null, error: true, savingUnknown: false, storedAccountUnverified: false }); }
    finally { if (active(captured)) { lock.current = false; setBusy(null); } }
  };
  const response = current?.response ?? null;
  const save = () => {
    if (!response || response.mode !== "preview") return;
    void request({ mode: "save_snapshot", ...response.snapshot.inputs, idempotencyKey: crypto.randomUUID() });
  };
  const cancel = () => {
    const generation = ++context.current.generation; lock.current = false; setBusy(null);
    setResult(pendingSave.current ? { identity, generation, response: null, error: true, savingUnknown: true, storedAccountUnverified: false } : null);
  };
  const dismissSave = () => { if (lock.current || !pendingSave.current) return; pendingSave.current = null; setResult(value => value ? { ...value } : null); };
  return { owner, available, response, sources: sourceCurrent, error: current?.error ?? false, savingUnknown: current?.savingUnknown ?? false, storedAccountUnverified: current?.storedAccountUnverified ?? false,
    busy: busy?.identity === identity && busy.generation === context.current.generation ? busy.mode : null, pendingSave: !!pendingSave.current,
    preview: (inputs: StageRaceEstimateInputs) => request({ mode: "preview", ...inputs }), save,
    history: (windowMonths: 1 | 3 | 6, cursor?: string) => request({ mode: "history_page", windowMonths, ...(cursor ? { cursor } : {}) }), discover, cancel, dismissSave,
    retrySave: () => { if (pendingSave.current) void request(pendingSave.current.request); } };
}
