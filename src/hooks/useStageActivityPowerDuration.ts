import { useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { StageActivityPowerDurationResponse, StageActivityPowerSourceMetadataResponse } from "@shared/types/stage-activity-power-snapshot";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { loadStagePowerDuration, loadStagePowerMetadata, stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
interface State { generation: number; metadata: StageActivityPowerSourceMetadataResponse | null; response: StageActivityPowerDurationResponse | null; savedResponse: StageActivityPowerDurationResponse | null; busy: boolean; error: boolean; failureKind: "source_precondition" | "generic" | null; reloadRequired: boolean }
/** 명시 버튼만 조회한다. 활동·입력의 세대로 ABA 전환의 늦은 응답을 숨긴다. */
export function useStageActivityPowerDuration(activity: Activity, draft: string, scopeKey = "") {
  const { user } = useAuth(), services = useFirebaseServices();
  const owner = user?.uid === activity.userId && !user.isAnonymous && activity.deletedAt == null && getDiscipline(activity.type) === "bike"
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(activity.id) && Number.isSafeInteger(activity.startTime) && activity.startTime > 0 && Number.isFinite(new Date(activity.startTime).getTime());
  const available = owner && stageActivityPowerAvailable();
  const identity = JSON.stringify([available ? user?.uid : null, activity.id, activity.startTime, activity.deletedAt, scopeKey]);
  const sdk = services.auth?.currentUser;
  const context = useRef({ identity, services, sdk, draft, generation: 0, draftGeneration: 0, busy: false });
  const [state, setState] = useState<State | null>(null);
  const history = useRef<{ generation: number; values: StageActivityPowerDurationResponse[] }>({ generation: 0, values: [] });
  const [selection, setSelection] = useState<{ generation: number; index: number } | null>(null);
  if (context.current.identity !== identity || context.current.services !== services || context.current.sdk !== sdk) context.current = { identity, services, sdk, draft, generation: context.current.generation + 1, draftGeneration: context.current.draftGeneration + 1, busy: false };
  if (context.current.draft !== draft) { context.current.draft = draft; context.current.draftGeneration++; }
  useEffect(() => () => { context.current.generation++; context.current.busy = false; }, []);
  if (history.current.generation !== context.current.generation) history.current = { generation: context.current.generation, values: [] };
  const current = state?.generation === context.current.generation ? state : null;
  const resultDraftGeneration = useRef(-1);
  const response = resultDraftGeneration.current === context.current.draftGeneration ? current?.response ?? null : null;
  const duration = /^\d+$/u.test(draft) ? Number(draft) : NaN;
  const canCalculate = available && !current?.busy && !current?.reloadRequired && current?.metadata?.state === "available" && Number.isSafeInteger(duration) && duration >= 1 && duration <= (current.metadata.maxIntegerDurationSeconds ?? 0);
  const run = async (calculate: boolean) => {
    if (!available || context.current.busy || calculate && !canCalculate) return;
    const captured = { generation: context.current.generation, draftGeneration: context.current.draftGeneration };
    const active = () => context.current.generation === captured.generation && services.auth?.currentUser === sdk;
    context.current.busy = true;
    setState({ generation: captured.generation, metadata: current?.metadata ?? null, response: null, savedResponse: current?.savedResponse ?? null, busy: true, error: false, failureKind: null, reloadRequired: calculate ? current?.reloadRequired ?? false : false });
    try {
      if (calculate && current?.metadata) {
        const result = await loadStagePowerDuration(services, activity.userId, current.metadata, duration);
        if (active()) {
          resultDraftGeneration.current = captured.draftGeneration;
          if (result.result?.state === "available" && captured.draftGeneration === context.current.draftGeneration && current.savedResponse) history.current.values.push(current.savedResponse);
          setState({ generation: captured.generation, metadata: current.metadata, response: result, savedResponse: result.result?.state === "available" && captured.draftGeneration === context.current.draftGeneration ? result : current?.savedResponse ?? null, busy: false, error: false, failureKind: null, reloadRequired: result.reason === "snapshot_missing" });
        }
      } else {
        const metadata = await loadStagePowerMetadata(services, activity.userId, activity.id, activity.startTime);
        if (active()) setState({ generation: captured.generation, metadata, response: null, savedResponse: current?.savedResponse ?? null, busy: false, error: false, failureKind: null, reloadRequired: false });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      const failureKind = code === "functions/failed-precondition" || code === "failed-precondition" ? "source_precondition" : "generic";
      const denied = ["functions/permission-denied", "permission-denied", "functions/unauthenticated", "unauthenticated", "functions/not-found", "not-found"].includes(String(code));
      if (active() && denied) { history.current.values = []; setSelection(null); }
      if (active()) setState({ generation: captured.generation, savedResponse: denied ? null : current?.savedResponse ?? null, metadata: calculate ? current?.metadata ?? null : null, response: null, busy: false, error: true, failureKind, reloadRequired: calculate });
    } finally { if (active()) context.current.busy = false; }
  };
  const selectedIndex = selection?.generation === context.current.generation ? selection.index : null;
  const selectedResponse = selectedIndex === null ? null : history.current.values[selectedIndex] ?? null;
  return { owner, available, previousResponses: history.current.values, selectedIndex, selectedResponse, selectPrevious: (index: number | null) => setSelection(index === null ? null : { generation: context.current.generation, index }), metadata: current?.metadata ?? null, response, savedResponse: current?.savedResponse ?? null, busy: current?.busy ?? false, error: current?.error ?? false, failureKind: current?.failureKind ?? null, reloadRequired: current?.reloadRequired ?? false, canCalculate,
    load: () => run(false), calculate: () => run(true) };
}
