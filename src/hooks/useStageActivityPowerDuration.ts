import { useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { StageActivityPowerDurationResponse, StageActivityPowerSourceMetadataResponse } from "@shared/types/stage-activity-power-snapshot";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { loadStagePowerDuration, loadStagePowerMetadata, stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
interface State { generation: number; metadata: StageActivityPowerSourceMetadataResponse | null; response: StageActivityPowerDurationResponse | null; busy: boolean; error: boolean; reloadRequired: boolean }
/** 명시 버튼만 조회한다. 활동·입력의 세대로 ABA 전환의 늦은 응답을 숨긴다. */
export function useStageActivityPowerDuration(activity: Activity, draft: string, scopeKey = "") {
  const { user } = useAuth(), services = useFirebaseServices();
  const owner = user?.uid === activity.userId && !user.isAnonymous && activity.deletedAt == null && getDiscipline(activity.type) === "bike"
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(activity.id) && Number.isSafeInteger(activity.startTime) && activity.startTime > 0 && Number.isFinite(new Date(activity.startTime).getTime());
  const available = owner && stageActivityPowerAvailable();
  const identity = JSON.stringify([available ? user?.uid : null, activity.id, activity.startTime, activity.deletedAt, scopeKey]);
  const context = useRef({ identity, services, draft, generation: 0, draftGeneration: 0, busy: false });
  const [state, setState] = useState<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services) context.current = { identity, services, draft, generation: context.current.generation + 1, draftGeneration: context.current.draftGeneration + 1, busy: false };
  if (context.current.draft !== draft) { context.current.draft = draft; context.current.draftGeneration++; }
  useEffect(() => () => { context.current.generation++; context.current.busy = false; }, []);
  const current = state?.generation === context.current.generation ? state : null;
  const resultDraftGeneration = useRef(-1);
  const response = resultDraftGeneration.current === context.current.draftGeneration ? current?.response ?? null : null;
  const duration = /^\d+$/u.test(draft) ? Number(draft) : NaN;
  const canCalculate = available && !current?.busy && !current?.reloadRequired && current?.metadata?.state === "available" && Number.isSafeInteger(duration) && duration >= 1 && duration <= (current.metadata.maxIntegerDurationSeconds ?? 0);
  const run = async (calculate: boolean) => {
    if (!available || context.current.busy || calculate && !canCalculate) return;
    const captured = { generation: context.current.generation, draftGeneration: context.current.draftGeneration };
    const active = () => context.current.generation === captured.generation;
    context.current.busy = true;
    setState({ generation: captured.generation, metadata: current?.metadata ?? null, response: null, busy: true, error: false, reloadRequired: calculate ? current?.reloadRequired ?? false : false });
    try {
      if (calculate && current?.metadata) {
        const result = await loadStagePowerDuration(services, activity.userId, current.metadata, duration);
        if (active()) {
          resultDraftGeneration.current = captured.draftGeneration;
          setState({ generation: captured.generation, metadata: current.metadata, response: result, busy: false, error: false, reloadRequired: result.reason === "snapshot_missing" });
        }
      } else {
        const metadata = await loadStagePowerMetadata(services, activity.userId, activity.id, activity.startTime);
        if (active()) setState({ generation: captured.generation, metadata, response: null, busy: false, error: false, reloadRequired: false });
      }
    } catch {
      if (active()) setState({ generation: captured.generation, metadata: calculate ? current?.metadata ?? null : null, response: null, busy: false, error: true, reloadRequired: calculate });
    } finally { if (active()) context.current.busy = false; }
  };
  return { owner, available, metadata: current?.metadata ?? null, response, busy: current?.busy ?? false, error: current?.error ?? false, reloadRequired: current?.reloadRequired ?? false, canCalculate,
    load: () => run(false), calculate: () => run(true) };
}
