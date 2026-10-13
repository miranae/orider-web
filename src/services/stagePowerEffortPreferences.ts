import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { StagePowerEffortAdjustedRequest, StagePowerEffortAdjustedResponse, StagePowerEffortOrphanInspectRequest, StagePowerEffortOrphanInspectResponse, StagePowerEffortPointControl } from "@shared/types/stage-power-effort-adjusted";
import { POWER_EFFORT_BASES, type StagePowerEffortPreferenceRequest } from "@shared/types/stage-power-effort-preference";
import { stageActivityPowerAvailable } from "./stageActivityPowerDuration";

export type PowerEffortRead = StagePowerEffortAdjustedRequest | StagePowerEffortOrphanInspectRequest;
export type PowerEffortResponse = StagePowerEffortAdjustedResponse | StagePowerEffortOrphanInspectResponse;
export interface PowerEffortMutationResponse {
  version: 1; scope: "one_duration_one_basis_one_origin";
  outcome: "stored_verified" | "stored_pending_source_refresh" | "commit_outcome_unknown" | "prior_committed_pending_current_refresh";
  activityId: string; activityIncarnationBinding: string; preferenceRevision: string; idempotencyKey: string;
  costs: StagePowerEffortAdjustedResponse["costs"];
}
const invalid = (): never => { throw Error("invalid_power_effort_response"); };
const obj = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) invalid();
  return value as Record<string, unknown>;
};
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256 && [...v].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127&&c!=="/");
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(v);
const int = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const power = (v: unknown) => v === null || typeof v === "number" && Number.isFinite(v) && v >= 0;
function identity(v: Record<string, unknown>) {
  if (!int(v.durationSeconds) || v.durationSeconds < 1 || v.durationSeconds > 604800 || !POWER_EFFORT_BASES.includes(v.basisVersion as never) || !["measured", "stored_native_watts_unverified"].includes(String(v.powerSource))) invalid();
}
export function validPowerEffortRead(request: PowerEffortRead, now=Date.now()): boolean {
  try {
    if(request.mode==="stage_power_effort_orphan_inspect") {
      obj(request,["version","mode","activityId","activityIncarnationBinding"]);
      return request.version===1&&id(request.activityId)&&hash(request.activityIncarnationBinding);
    }
    obj(request,["version","mode","activityIds","periods",...(request.mode==="stage_power_effort_adjusted_v1"?["durationSeconds"]:[])]);
    if(request.version!==1||!["stage_power_effort_adjusted_native12","stage_power_effort_adjusted_canonical","stage_power_effort_adjusted_v1"].includes(request.mode)||!Array.isArray(request.activityIds)||request.activityIds.length<1||request.activityIds.length>(request.mode==="stage_power_effort_adjusted_canonical"?20:2)||!request.activityIds.every(id)||new Set(request.activityIds).size!==request.activityIds.length||!Array.isArray(request.periods)||request.periods.length>2||new Set(request.periods.map(p=>p.id)).size!==request.periods.length)return false;
    if(request.mode==="stage_power_effort_adjusted_v1"&&(!int(request.durationSeconds)||request.durationSeconds<1||request.durationSeconds>604800))return false;
    return request.periods.every(p=>{obj(p,["id","fromInclusiveMs","toExclusiveMs"]);return typeof p.id==="string"&&/^[A-Za-z0-9_-]{1,80}$/u.test(p.id)&&int(p.fromInclusiveMs)&&int(p.toExclusiveMs)&&p.fromInclusiveMs<p.toExclusiveMs&&p.toExclusiveMs<=now;});
  }catch{return false;}
}
export function validatePowerEffortReady(value: unknown): Omit<StagePowerEffortPreferenceRequest, "idempotencyKey"> {
  const v = obj(value, ["activityId", "expectedActivityIncarnation", "activityRevision", "baseMetricsRevision", "currentPreferenceRevision", "currentAuthorityHash", "excluded", "durationSeconds", "basisVersion", "powerSource"]);
  identity(v);
  if (!id(v.activityId) || !hash(v.expectedActivityIncarnation) || !text(v.activityRevision) || !text(v.baseMetricsRevision) || v.currentPreferenceRevision !== null && !hash(v.currentPreferenceRevision) || typeof v.excluded !== "boolean" || (v.excluded ? !hash(v.currentAuthorityHash) : v.currentAuthorityHash !== null || !hash(v.currentPreferenceRevision))) invalid();
  return structuredClone(value) as Omit<StagePowerEffortPreferenceRequest, "idempotencyKey">;
}
function points(value: unknown, activityId: string, binding: unknown, orphan = false): StagePowerEffortPointControl[] {
  if (!Array.isArray(value) || value.length > 400) invalid();
  const seen = new Set<string>();
  for (const value0 of value as unknown[]) {
    const p = obj(value0, ["durationSeconds", "basisVersion", "powerSource", "state", "originalWatts", "originalWattsPerKg", "excluded", "excludeReady", "restoreReady"]); identity(p);
    const key = JSON.stringify([p.durationSeconds,p.basisVersion,p.powerSource]); if (seen.has(key)) invalid(); seen.add(key);
    if (!["available", "missing", "short", "unresolved"].includes(String(p.state)) || !power(p.originalWatts) || !power(p.originalWattsPerKg) || typeof p.excluded !== "boolean" || p.originalWatts === null && p.originalWattsPerKg !== null) invalid();
    if (orphan && (p.state !== "missing" || p.originalWatts !== null || p.originalWattsPerKg !== null || p.excluded !== true || p.excludeReady !== null)) invalid();
    for (const name of ["excludeReady", "restoreReady"] as const) if (p[name] !== null) {
      const ready = validatePowerEffortReady(p[name]);
      if (ready.activityId !== activityId || ready.expectedActivityIncarnation !== binding || ready.durationSeconds !== p.durationSeconds || ready.basisVersion !== p.basisVersion || ready.powerSource !== p.powerSource || ready.excluded !== (name === "excludeReady") || (name === "excludeReady" ? p.excluded || p.state !== "available" : !p.excluded)) invalid();
    }
  }
  return value as StagePowerEffortPointControl[];
}
function costs(value: unknown, documents: number, metadata: number, writes: number) {
  const c = obj(value, ["reserved", "delivered", "deliveryUnknown", "queries", "raw"]);
  for (const name of ["reserved", "delivered"] as const) {
    const f = obj(c[name], ["documents", "metadata", "auth", "writes"]);
    if (!Object.values(f).every(int) || Number(f.documents)>documents || Number(f.metadata)>metadata || Number(f.auth)>2 || Number(f.writes)>writes) invalid();
  }
  if (Object.keys(c.delivered as object).some(key => Number((c.delivered as Record<string,unknown>)[key]) > Number((c.reserved as Record<string,unknown>)[key])) || typeof c.deliveryUnknown !== "boolean" || c.queries !== 0 || c.raw !== 0) invalid();
}
export function validatePowerEffortRead(value: unknown, request: PowerEffortRead): PowerEffortResponse {
  const byteLimit=request.mode==="stage_power_effort_adjusted_canonical"?2*1024*1024:request.mode==="stage_power_effort_adjusted_native12"?512*1024:request.mode==="stage_power_effort_orphan_inspect"?128*1024:256*1024;
  if (new TextEncoder().encode(JSON.stringify(value)).length > byteLimit) invalid();
  if (request.mode === "stage_power_effort_orphan_inspect") {
    const v = obj(value,["version","mode","scope","activityId","activityIncarnationBinding","preferenceRevision","sourceState","points","costs"]);
    if (v.version!==1 || v.mode!==request.mode || v.scope!=="owned_private_decision_restore_only" || v.activityId!==request.activityId || v.activityIncarnationBinding!==request.activityIncarnationBinding || v.preferenceRevision!==null&&!hash(v.preferenceRevision) || !["missing","soft_deleted","owned_present"].includes(String(v.sourceState))) invalid();
    points(v.points,request.activityId,request.activityIncarnationBinding,true); costs(v.costs,28,0,0);
  } else {
    const v = obj(value,["version","mode","scope","populationCoverage","originalClockVerified","sources","periods","costs"]);
    if (v.version!==1 || v.mode!==request.mode || v.scope!=="selected_and_checked_activities" || v.populationCoverage!=="partial_checked_subset" || v.originalClockVerified!==false || !Array.isArray(v.sources) || v.sources.length!==request.activityIds.length || !Array.isArray(v.periods) || v.periods.length!==request.periods.length) invalid();
    const sources = v.sources as StagePowerEffortAdjustedResponse["sources"];
    for (const [i,s] of sources.entries()) {
      obj(s,["activityId","activityIncarnationBinding","incarnationBasis","originEpochMs","preferenceRevision","points"]);
      if (s.activityId!==request.activityIds[i] || s.activityIncarnationBinding!==null&&!hash(s.activityIncarnationBinding) || !["document_create_time_and_validated_native_lifecycle","legacy_document_create_time_only","unavailable"].includes(s.incarnationBasis) || s.originEpochMs!==null&&!int(s.originEpochMs) || s.preferenceRevision!==null&&!hash(s.preferenceRevision)) invalid();
      points(s.points,s.activityId,s.activityIncarnationBinding);
    }
    for (const [i,p] of (v.periods as StagePowerEffortAdjustedResponse["periods"]).entries()) {
      obj(p,["period","rows"]); obj(p.period,["id","fromInclusiveMs","toExclusiveMs"]);
      if (p.period.id!==request.periods[i]!.id || p.period.fromInclusiveMs!==request.periods[i]!.fromInclusiveMs || p.period.toExclusiveMs!==request.periods[i]!.toExclusiveMs || !Array.isArray(p.rows) || p.rows.length>400) invalid();
      for (const r of p.rows) {
        obj(r,["durationSeconds","basisVersion","powerSource","watts","wattsPerKg","counts"]); identity(r as unknown as Record<string,unknown>);
        const c = obj(r.counts,["physicalGroups","excluded","unresolved","missing","short","qualified"]);
        if (!Object.values(c).every(int) || Object.values(c).some(n=>Number(n)>request.activityIds.length)) invalid();
        for (const unit of ["watts","wattsPerKg"] as const) if (r[unit]!==null) {
          const w = r[unit]!; obj(w,["activityId","watts","wattsPerKg","activityIncarnationBinding"]);
          const s = sources.find(s=>s.activityId===w.activityId), point=s?.points.find(p=>p.durationSeconds===r.durationSeconds&&p.basisVersion===r.basisVersion&&p.powerSource===r.powerSource);
          if (!s || s.activityIncarnationBinding!==w.activityIncarnationBinding || s.originEpochMs===null || s.originEpochMs<p.period.fromInclusiveMs || s.originEpochMs>=p.period.toExclusiveMs || !point || point.excluded || point.state!=="available" || point.originalWatts!==w.watts || point.originalWattsPerKg!==w.wattsPerKg || !power(w.watts) || w.watts===null || unit==="wattsPerKg"&&w.wattsPerKg===null) invalid();
        }
      }
    }
    const n=request.activityIds.length, canonical=request.mode==="stage_power_effort_adjusted_canonical";
    costs(v.costs,canonical?16*n+12:30*n,canonical?0:2*n,0);
  }
  return structuredClone(value) as PowerEffortResponse;
}
export function validatePowerEffortMutation(value: unknown, request: StagePowerEffortPreferenceRequest): PowerEffortMutationResponse {
  const v=obj(value,["version","scope","outcome","activityId","activityIncarnationBinding","preferenceRevision","idempotencyKey","costs"]);
  if (v.version!==1 || v.scope!=="one_duration_one_basis_one_origin" || !["stored_verified","stored_pending_source_refresh","commit_outcome_unknown","prior_committed_pending_current_refresh"].includes(String(v.outcome)) || v.activityId!==request.activityId || v.activityIncarnationBinding!==request.expectedActivityIncarnation || !hash(v.preferenceRevision) || v.idempotencyKey!==request.idempotencyKey) invalid();
  const native=request.basisVersion.startsWith("stage_native_"); costs(v.costs,native?34:32,native?2:0,2);
  return structuredClone(value) as PowerEffortMutationResponse;
}
export async function callPowerEffort(services: FirebaseServices, uid: string, request: PowerEffortRead | StagePowerEffortPreferenceRequest, active:()=>boolean) {
  if("idempotencyKey" in request){const {idempotencyKey,...ready}=request;validatePowerEffortReady(ready);if(!hash(idempotencyKey))throw Error("invalid_power_effort_request");}
  else if(!validPowerEffortRead(request))throw Error("invalid_power_effort_request");
  const user=services.auth.currentUser;
  const valid=()=>active()&&stageActivityPowerAvailable()&&!!user&&!user.isAnonymous&&user.uid===uid&&user.tenantId===null&&services.auth.currentUser===user;
  if (services.functions.app!==services.auth.app || services.functions.customDomain!=="https://asia-northeast3-orider-dev.cloudfunctions.net" || !valid()) throw Error("account_changed");
  await services.ensureAppCheckReady(); if (!valid()) throw Error("account_changed");
  const mutation="idempotencyKey" in request;
  const result=await httpsCallable(services.functions,mutation?"setStagePowerEffortPreference":"getStagePowerEffortAdjustedPeriods")(request);
  if (!valid()) throw Error("account_changed");
  const decoded=mutation?validatePowerEffortMutation(result.data,request):validatePowerEffortRead(result.data,request);
  if (!valid()) throw Error("account_changed"); return decoded;
}
export function newPowerEffortKey() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join(""); }
