import { useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { StageCyclingDistanceCoveredRankingsRequest as Request, StageCyclingDistanceCoveredRankingsResponse as Response } from "@shared/types/stage-cycling-distance-covered-rankings";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { stageCyclingPreferenceAvailable } from "../services/stageCyclingDistanceEffortPreference";
import { cyclingCoveredPreferenceChanges, loadCyclingCoveredRankings, validCyclingCoveredRequest } from "../services/stageCyclingDistanceCoveredRankings";
type Status = "idle" | "loading" | "ready" | "invalidated" | "error";
interface State { generation: number; status: Status; response: Response | null }
/** 선택·인증 세대마다 전체 교체한다. 확인 버튼 외에는 네트워크 요청이 없다. */
export function useStageCyclingDistanceCoveredRankings(activity: Activity, request: Request | null, headIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices(), nativeUser = services.auth.currentUser;
  const available = !!request && validCyclingCoveredRequest(request) && stageCyclingPreferenceAvailable() && activity.deletedAt == null && getDiscipline(activity.type) === "bike" && user?.uid === activity.userId && !user.isAnonymous && nativeUser?.uid === user.uid && !nativeUser.isAnonymous;
  const identity = JSON.stringify([available, activity.userId, activity.id, headIdentity, request]);
  const context = useRef({ identity, services, nativeUser, generation: 0, controller: null as AbortController | null });
  const [state, setState] = useState<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services || context.current.nativeUser !== nativeUser) {
    context.current.controller?.abort();
    context.current = { identity, services, nativeUser, generation: context.current.generation + 1, controller: null };
  }
  const clear = (status: Status) => { context.current.controller?.abort(); context.current.controller = null; context.current.generation++; setState({ generation: context.current.generation, status, response: null }); };
  useEffect(() => {
    let observed = false;
    const unsubscribe = onIdTokenChanged(services.auth, next => { if (observed || next !== context.current.nativeUser) clear("idle"); observed = true; });
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === activity.userId) clear("invalidated"); };
    cyclingCoveredPreferenceChanges.addEventListener("changed", changed);
    return () => { unsubscribe(); cyclingCoveredPreferenceChanges.removeEventListener("changed", changed); context.current.controller?.abort(); context.current.generation++; };
  }, [services, activity.userId]);
  const current = state?.generation === context.current.generation ? state : null;
  const confirm = async (profile: 10 | 20) => {
    if (!available || !request || context.current.identity !== identity || context.current.services !== services || context.current.nativeUser !== services.auth.currentUser || context.current.controller) return;
    const generation = ++context.current.generation, controller = new AbortController();
    context.current.controller = controller;
    const active = () => context.current.generation === generation && context.current.identity === identity && context.current.services === services && context.current.nativeUser === services.auth.currentUser && !controller.signal.aborted;
    setState({ generation, status: "loading", response: null });
    try {
      const response = await loadCyclingCoveredRankings(services, { ...request, profile }, controller.signal);
      if (active()) setState({ generation, status: "ready", response });
    } catch { if (active()) setState({ generation, status: "error", response: null }); }
    finally { if (active()) context.current.controller = null; }
  };
  return { available, status: current?.status ?? "idle", response: current?.response ?? null, confirm, cancel: () => clear("idle"), invalidate: () => clear("invalidated") };
}
