import { invalidateCyclingCoveredPreferences } from "../services/stageCyclingDistanceCoveredRankings";
import { onIdTokenChanged } from "firebase/auth";
import { stageCyclingPreferenceAvailable, validCyclingPreferenceId } from "../services/stageCyclingDistanceEffortPreference";
import { useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingSnapshotReadResponse as ReadResponse } from "@shared/types/stage-cycling-snapshot-effort-preferences";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { loadCyclingSnapshotPreference, saveCyclingSnapshotPreference } from "../services/stageCyclingSnapshotEffortPreference";
const READ_TTL = 5 * 60_000;
interface State { expiresAt: number; generation: number; read: ReadResponse | null; busy: boolean; saved: boolean; failure: "changed" | "error" | null }
/** 조회·선택 저장은 명시 버튼만 실행하며 원본/기간 집계를 변경하지 않는다. */
export function useStageCyclingSnapshotEffortPreference(activity: Activity, scopeKey = "") {
  const { user } = useAuth(), services = useFirebaseServices();
  const available = user?.uid === activity.userId && !user.isAnonymous && activity.deletedAt == null && getDiscipline(activity.type) === "bike" && validCyclingPreferenceId(activity.id) && stageCyclingPreferenceAvailable();
  const nativeUser = services.auth.currentUser;
  const identity = JSON.stringify([available ? user?.uid : null, activity.id, activity.startTime, activity.deletedAt, scopeKey]);
  const context = useRef({ identity, services, nativeUser, generation: 0, busy: false });
  const [state, setState] = useState<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services || context.current.nativeUser !== nativeUser) context.current = { identity, services, nativeUser, generation: context.current.generation + 1, busy: false };
  useEffect(() => { let observed = false; return onIdTokenChanged(services.auth, next => { if (observed || next !== context.current.nativeUser) { context.current.generation++; context.current.busy = false; setState(null); } observed = true; }); }, [services]);
  useEffect(() => { if (!state?.read) return; const timer = setTimeout(() => { context.current.generation++; context.current.busy = false; setState(null); }, Math.max(0, state.expiresAt - Date.now())); return () => clearTimeout(timer); }, [state]);
  useEffect(() => () => { context.current.generation++; context.current.busy = false; }, []);
  const current = state?.generation === context.current.generation && state.expiresAt > Date.now() ? state : null;
  const run = async (target?: BikeDistanceKey) => {
    if (!available || context.current.identity !== identity || context.current.services !== services || context.current.nativeUser !== services.auth.currentUser || context.current.busy || target && (!current?.read || Date.now() >= current.expiresAt)) return;
    const generation = context.current.generation, read = current?.read;
    const deadline = Date.now() + READ_TTL;
    const active = () => context.current.generation === generation && Date.now() < deadline;
    context.current.busy = true;
    // 쓰기 결과로 새 CAS를 추측하지 않는다. 성공/실패 후 다시 확인해야 한다.
    setState({ expiresAt: Date.now() + READ_TTL, generation, read: null, busy: true, saved: false, failure: null });
    try {
      if (target && read) {
        await saveCyclingSnapshotPreference(services, activity.userId, read, target, crypto.randomUUID());
        invalidateCyclingCoveredPreferences(activity.userId);
        if (active()) setState({ expiresAt: Date.now() + READ_TTL, generation, read: null, busy: false, saved: true, failure: null });
      } else {
        const response = await loadCyclingSnapshotPreference(services, activity.userId, activity.id);
        if (active()) setState({ expiresAt: Date.now() + READ_TTL, generation, read: response, busy: false, saved: false, failure: null });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (active()) setState({ expiresAt: Date.now() + READ_TTL, generation, read: null, busy: false, saved: false, failure: code === "functions/failed-precondition" || code === "failed-precondition" ? "changed" : "error" });
    } finally { if (context.current.generation === generation) { context.current.busy = false; if (Date.now() >= deadline) setState(null); } }
  };
  return { available, read: current?.read ?? null, busy: current?.busy ?? false, saved: current?.saved ?? false, failure: current?.failure ?? null,
    inspect: () => run(), save: (target: BikeDistanceKey) => run(target) };
}
