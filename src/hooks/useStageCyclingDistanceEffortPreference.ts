import { useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { StageCyclingDistanceEffortPreferenceReadResponse as ReadResponse } from "@shared/types/stage-cycling-distance-effort-preference-reader";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { loadCyclingPreference, saveCyclingPreference, stageCyclingPreferenceAvailable, validCyclingPreferenceId } from "../services/stageCyclingDistanceEffortPreference";
interface State { generation: number; read: ReadResponse | null; busy: boolean; saved: boolean; failure: "changed" | "error" | null }
/** 조회·선택 저장은 명시 버튼만 실행하며 원본/기간 집계를 변경하지 않는다. */
export function useStageCyclingDistanceEffortPreference(activity: Activity, scopeKey = "") {
  const { user } = useAuth(), services = useFirebaseServices();
  const available = user?.uid === activity.userId && !user.isAnonymous && activity.deletedAt == null && getDiscipline(activity.type) === "bike" && validCyclingPreferenceId(activity.id) && stageCyclingPreferenceAvailable();
  const identity = JSON.stringify([available ? user?.uid : null, activity.id, activity.startTime, activity.deletedAt, scopeKey]);
  const context = useRef({ identity, services, generation: 0, busy: false });
  const [state, setState] = useState<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services) context.current = { identity, services, generation: context.current.generation + 1, busy: false };
  useEffect(() => () => { context.current.generation++; context.current.busy = false; }, []);
  const current = state?.generation === context.current.generation ? state : null;
  const run = async (target?: BikeDistanceKey) => {
    if (!available || context.current.busy || target && !current?.read) return;
    const generation = context.current.generation, read = current?.read;
    const active = () => context.current.generation === generation;
    context.current.busy = true;
    // 쓰기 결과로 새 CAS를 추측하지 않는다. 성공/실패 후 다시 확인해야 한다.
    setState({ generation, read: null, busy: true, saved: false, failure: null });
    try {
      if (target && read) {
        await saveCyclingPreference(services, activity.userId, read, target, crypto.randomUUID());
        if (active()) setState({ generation, read: null, busy: false, saved: true, failure: null });
      } else {
        const response = await loadCyclingPreference(services, activity.userId, activity.id);
        if (active()) setState({ generation, read: response, busy: false, saved: false, failure: null });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (active()) setState({ generation, read: null, busy: false, saved: false, failure: code === "functions/failed-precondition" || code === "failed-precondition" ? "changed" : "error" });
    } finally { if (active()) context.current.busy = false; }
  };
  return { available, read: current?.read ?? null, busy: current?.busy ?? false, saved: current?.saved ?? false, failure: current?.failure ?? null,
    inspect: () => run(), save: (target: BikeDistanceKey) => run(target) };
}
