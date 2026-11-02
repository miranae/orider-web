import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { NativePowerV2ReaderResponse } from "@shared/types/stage-native-power-v2-publication";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
import { loadNativePowerV2Duration, nativePowerV2DurationSeconds } from "../services/nativePowerV2Duration";
interface State { generation: number; metadata: NativePowerV2ReaderResponse | null; confirmedAt: number | null; expiresAt: number | null; busy: boolean; failure: boolean }
interface Completed { id: string; response: NativePowerV2ReaderResponse; duration: number; calculatedAt: number; requestIdentity: string }
export function useNativePowerV2Duration(activity: Activity, draft: string, scopeKey = "") {
 const { user } = useAuth(), services = useFirebaseServices(), nativeUser = services.auth.currentUser;
 const authInstance = services.auth, functionsInstance = services.functions, authRealm = services.auth.app, functionRealm = services.functions.app, functionsBase = services.functions.customDomain;
 const mounted = useRef(false);
 const [authEpoch, setAuthEpoch] = useState(0), [state, setState] = useState<State | null>(null);
 const duration = nativePowerV2DurationSeconds(draft);
 const owner = !!user && !user.isAnonymous && user.uid === activity.userId && activity.deletedAt == null && getDiscipline(activity.type) === "bike" && /^orider_[A-Za-z0-9_-]{0,153}$/u.test(activity.id);
 const available = owner && !!nativeUser && !nativeUser.isAnonymous && nativeUser.uid === activity.userId && stageActivityPowerAvailable() && services.functions.app === services.auth.app && services.functions.customDomain === "https://asia-northeast3-orider-dev.cloudfunctions.net";
 const head = activity as Activity & Record<string, unknown>;
 // Calculation inputs retire opaque sessions and in-flight work, not completed observations.
 const identity = JSON.stringify([available ? activity.userId : null, authEpoch, activity.id, activity.startTime, activity.endTime, activity.deletedAt, activity.contentRevision, activity.contentSelectedRevision, activity.sourceMeta, activity.visibility, activity.isVirtualPower, head.metadataRevision, head.updatedAt, scopeKey, draft]);
 const ref = useRef({ identity, services, nativeUser, authInstance, functionsInstance, authRealm, functionRealm, functionsBase, generation: 0, busy: false });
 if (ref.current.identity !== identity || ref.current.services !== services || ref.current.nativeUser !== nativeUser || ref.current.authInstance !== authInstance || ref.current.functionsInstance !== functionsInstance || ref.current.authRealm !== authRealm || ref.current.functionRealm !== functionRealm || ref.current.functionsBase !== functionsBase) ref.current = { identity, services, nativeUser, authInstance, functionsInstance, authRealm, functionRealm, functionsBase, generation: ref.current.generation + 1, busy: false };
 // Completed results are only retained in this mounted owner/session, never persisted or reused by another activity.
 const accessIdentity = JSON.stringify([available ? activity.userId : null, activity.id, activity.deletedAt]);
 const access = useRef({ identity: accessIdentity, services, nativeUser, authInstance, functionsInstance, authRealm, functionRealm, functionsBase });
 if (access.current.identity !== accessIdentity || access.current.services !== services || access.current.nativeUser !== nativeUser || access.current.authInstance !== authInstance || access.current.functionsInstance !== functionsInstance || access.current.authRealm !== authRealm || access.current.functionRealm !== functionRealm || access.current.functionsBase !== functionsBase) access.current = { identity: accessIdentity, services, nativeUser, authInstance, functionsInstance, authRealm, functionRealm, functionsBase };
 const accessScope = access.current;
 const [completed, setCompleted] = useState<{ scope: typeof accessScope; entries: Completed[]; selected: string } | null>(null);
 const sequence = useRef(0);
 const saved = available && completed?.scope === accessScope ? completed : null;
 const selected = saved?.entries.find(entry => entry.id === saved.selected) ?? null;
 const invalidate = useCallback(() => { ref.current.generation++; ref.current.busy = false; setState(null); }, []);
 useEffect(() => onIdTokenChanged(services.auth, () => {
  invalidate();
  if (services.auth.currentUser !== nativeUser) setCompleted(null);
  setAuthEpoch(v => v + 1);
 }), [services, nativeUser, invalidate]);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; ref.current.generation++; ref.current.busy = false; }; }, []);
 // The 30-minute local maximum bounds new calculation eligibility, not the displayed completed result.
 const now = Date.now();
 const current = state?.generation === ref.current.generation && (!state.expiresAt || state.confirmedAt !== null && now >= state.confirmedAt && now < state.expiresAt) ? state : null;
 useEffect(() => {
  if (!state?.expiresAt || state.generation !== ref.current.generation) return;
  const remaining = state.expiresAt - Date.now(); if (remaining <= 0) { invalidate(); return; }
  const timer = setTimeout(() => { if (ref.current.generation === state.generation) invalidate(); }, remaining);
  return () => clearTimeout(timer);
 }, [state, invalidate]);
 const renderGeneration = ref.current.generation;
 const scopeActive = () => mounted.current && ref.current.generation === renderGeneration && ref.current.identity === identity && ref.current.services === services && ref.current.nativeUser === nativeUser && services.auth === authInstance && services.functions === functionsInstance && services.auth.app === authRealm && services.functions.app === functionRealm && services.functions.customDomain === functionsBase && services.auth.currentUser === nativeUser && !!nativeUser && !nativeUser.isAnonymous && nativeUser.uid === activity.userId && available && stageActivityPowerAvailable();
 const cancel = () => { if (scopeActive()) { invalidate(); setCompleted(null); } };
 const selectResult = (id: string) => { if (scopeActive()) setCompleted(previous => previous?.scope === accessScope && previous.entries.some(entry => entry.id === id) ? { ...previous, selected: id } : previous); };
 const canCalculate = available && duration !== null && !current?.busy && current?.metadata?.state === "available" && !!current.metadata.session;
 const run = async (compute: boolean) => {
  if (!scopeActive() || duration === null || ref.current.busy || compute && !canCalculate) return;
  if (compute && (!current?.expiresAt || current.confirmedAt === null || Date.now() < current.confirmedAt || Date.now() >= current.expiresAt)) { invalidate(); return; }
  const generation = renderGeneration, startedAt = Date.now(), active = scopeActive;
  ref.current.busy = true;
  setState({ generation, metadata: compute ? current?.metadata ?? null : null, confirmedAt: compute ? current?.confirmedAt ?? null : null, expiresAt: compute ? current?.expiresAt ?? null : null, busy: true, failure: false });
  try {
   const response = await loadNativePowerV2Duration(services, activity.userId, compute ? { mode: "stage_native_power_v2_duration", activityId: activity.id, durationSeconds: duration, periodBinding: null, session: current!.metadata!.session! } : { mode: "stage_native_power_v2_metadata", activityId: activity.id, durationSeconds: duration, periodBinding: null }, active);
   const receivedAt = Date.now(); if (!active()) return;
   if (receivedAt < startedAt || compute && (!current?.expiresAt || receivedAt >= current.expiresAt)) throw Error("expired_native_power_v2_session");
   const reusable = response.state === "available" || response.state === "no_continuous_window";
   if (compute && reusable) {
    const entry = { id: String(++sequence.current), response: { ...response, session: null }, duration, calculatedAt: receivedAt, requestIdentity: identity };
    setCompleted(previous => ({ scope: accessScope, entries: [...(previous?.scope === accessScope ? previous.entries : []), entry], selected: entry.id }));
   }
   setState({ generation, metadata: compute ? reusable ? current!.metadata : null : response, confirmedAt: reusable ? compute ? current!.confirmedAt : startedAt : null, expiresAt: reusable ? compute ? current!.expiresAt : startedAt + 1800000 : null, busy: false, failure: false });
  } catch (error) {
   if (active()) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    // A failed computation never renews its opaque session. Only an explicit server access check
    // can retain completed witnesses bound to the exact publication revision it confirmed.
    const details = error && typeof error === "object" && "details" in error ? error.details : null;
    const evidence = details && typeof details === "object" ? details as Record<string, unknown> : null;
    const confirmedRevision = (code === "functions/failed-precondition" || code === "failed-precondition")
     && evidence?.reason === "saved_result_access_confirmed" && typeof evidence.snapshotRevision === "string"
     && /^[a-f0-9]{64}$/u.test(evidence.snapshotRevision) ? evidence.snapshotRevision : null;
    if (confirmedRevision) setCompleted(previous => {
     if (previous?.scope !== accessScope) return null;
     const entries = previous.entries.filter(entry => entry.response.witness?.snapshotRevision === confirmedRevision);
     if (!entries.length) return null;
     return { ...previous, entries, selected: entries.some(entry => entry.id === previous.selected) ? previous.selected : entries[entries.length - 1]!.id };
    });
    else if (/permission-denied|unauthenticated|not-found|failed-precondition/.test(code)) setCompleted(null);
    setState({ generation, metadata: null, confirmedAt: null, expiresAt: null, busy: false, failure: true });
   }
  } finally { if (active()) ref.current.busy = false; }
 };
 return { available, duration, metadata: current?.metadata ?? null, result: selected?.response ?? null,
  history: saved?.entries.map(({ id, duration, calculatedAt }) => ({ id, duration, calculatedAt })) ?? [], selectedResultId: selected?.id ?? "", selectResult,
  previousResult: !!selected && (selected.requestIdentity !== identity || current?.metadata?.state !== "available" || !!current.busy || !!current.failure || selected.id !== saved?.entries[saved.entries.length - 1]?.id),
  busy: current?.busy ?? false, failure: current?.failure ?? false, canCalculate, cancel, confirm: () => run(false), calculate: () => run(true) };
}
