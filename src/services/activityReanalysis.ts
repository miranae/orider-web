import { savedActivityMetrics } from "./savedActivityMetrics";
import type { ActivityMetricsDoc } from "../hooks/useActivityMetrics";
import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
export interface ActivityReanalysisState {
  activityId: string; metricsRevision: string | null; calculatorVersion: number | null;
  latestCalculatorVersion: number; canReanalyze: boolean; pending: boolean;
  lastRequest: { requestId: string; status: "queued" | "completed" | "failed" | "superseded"; previousRevision: string | null } | null;
}
export interface SavedActivityAnalysis { revisionId: string; metrics: ActivityMetricsDoc }
export interface ActivityAnalysisHistory { items: Array<{revisionId:string;calculatedAt:number|null;calculatorVersion:number|null}>; nextCursor:string|null; selected:SavedActivityAnalysis|null }
export interface ActivityReanalysisResult {
  activityId: string; requestId: string; status: "queued" | "completed"; previousRevision: string | null;
}
const revision = (value: unknown) => value === null || typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function createActivityReanalysisClient(services: FirebaseServices) {
  const { auth, functions } = services, viewer = auth.currentUser, app = auth.app;
  const assertAccount = () => {
    if (!viewer || viewer.isAnonymous || services.auth !== auth || auth.currentUser !== viewer || auth.app !== app
      || services.functions !== functions || functions.app !== app) throw Error("account_changed");
  };
  async function invoke<T>(name: string, data: object): Promise<T> {
    let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => { if (expired) throw Error("reanalysis_timeout"); assertAccount(); };
    current();
    try {
      return await Promise.race([
        (async () => {
          await services.ensureAppCheckReady(); current();
          const result = await httpsCallable<object, T>(functions, name, { timeout: 10000 })(data);
          current(); return result.data;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(Error("reanalysis_timeout")); }, 10000); }),
      ]);
    } finally { clearTimeout(timer); expired = true; }
  }
  const activity = (value: string) => { if (!value || value.length > 200 || value.includes("/")) throw Error("invalid_activity"); };
  return {
    async load(activityId: string, requestId?: string): Promise<ActivityReanalysisState> {
      activity(activityId);
      const result = await invoke<ActivityReanalysisState>("getActivityReanalysisState", { activityId, ...(requestId ? { requestId } : {}) });
      if (!result || result.activityId !== activityId || !revision(result.metricsRevision)
        || !(result.calculatorVersion === null || Number.isSafeInteger(result.calculatorVersion) && result.calculatorVersion >= 0)
        || !Number.isSafeInteger(result.latestCalculatorVersion) || result.latestCalculatorVersion < 0 || typeof result.canReanalyze !== "boolean" || typeof result.pending !== "boolean"
        || !(result.lastRequest === null || result.lastRequest && /^[A-Za-z0-9_-]{1,128}$/.test(result.lastRequest.requestId) && ["queued", "completed", "failed", "superseded"].includes(result.lastRequest.status) && revision(result.lastRequest.previousRevision))) throw Error("invalid_reanalysis_state");
      return result;
    },
    async history(activityId: string, revisionId?: string, cursor?: string): Promise<ActivityAnalysisHistory> {
      activity(activityId);
      if (revisionId !== undefined && !revision(revisionId)) throw Error("invalid_revision");
      const result = await invoke<ActivityAnalysisHistory>("getActivityAnalysisHistory", { activityId, ...(revisionId ? { revisionId } : {}), ...(cursor ? { cursor } : {}) });
      const version = (v: unknown) => v === null || Number.isSafeInteger(v) && (v as number) >= 0;
      if (!result || !Array.isArray(result.items) || result.items.length > 50 || result.items.some(row => !row || !row.revisionId || !revision(row.revisionId) || !version(row.calculatorVersion) || !version(row.calculatedAt))
        || !(result.nextCursor === null || typeof result.nextCursor === "string" && result.nextCursor.length > 0 && result.nextCursor.length < 10000)
        || !(result.selected === null || result.selected && result.selected.revisionId === revisionId && result.selected.metrics && typeof result.selected.metrics === "object" && !Array.isArray(result.selected.metrics))) throw Error("invalid_analysis_history");
      if (result.selected) {
        const saved = savedActivityMetrics(result.selected.metrics as unknown as Record<string, unknown>);
        if (!saved.metrics) throw Error("unavailable_saved_analysis");
        return { ...result, selected: { ...result.selected, metrics: saved.metrics } };
      }
      return result;
    },
    async request(activityId: string, requestId: string, expectedMetricsRevision: string | null): Promise<ActivityReanalysisResult> {
      activity(activityId);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || !revision(expectedMetricsRevision)) throw Error("invalid_reanalysis_request");
      const result = await invoke<ActivityReanalysisResult>("requestActivityReanalysis", { activityId, requestId, expectedMetricsRevision });
      if (!result || result.activityId !== activityId || result.requestId !== requestId || !["queued", "completed"].includes(result.status)
        || result.previousRevision !== expectedMetricsRevision) throw Error("invalid_reanalysis_response");
      return result;
    },
  };
}
