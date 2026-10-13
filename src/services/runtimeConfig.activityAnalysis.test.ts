import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig, loadRuntimeConfig, resetRuntimeConfigForTests } from "./runtimeConfig";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetRuntimeConfigForTests(); });
describe("activity analysis expansion runtime gate", () => {
  it("defaults off and accepts only explicit runtime boolean true", async () => {
    vi.stubEnv("VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED", "false");
    resetRuntimeConfigForTests(); expect(getRuntimeConfig().activityAnalysisExpansionEnabled).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activityAnalysisExpansionEnabled: true }) }));
    await loadRuntimeConfig(); expect(getRuntimeConfig().activityAnalysisExpansionEnabled).toBe(true);
  });
  it.each(["true", 1, null, {}, false])("fails closed on invalid or disabled remote value %s", async value => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activityAnalysisExpansionEnabled: value }) }));
    await loadRuntimeConfig(); expect(getRuntimeConfig().activityAnalysisExpansionEnabled).toBe(false);
  });
  it("allows exact local opt-in while a missing remote key preserves the fallback", async () => {
    vi.stubEnv("VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED", "true"); resetRuntimeConfigForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await loadRuntimeConfig(); expect(getRuntimeConfig().activityAnalysisExpansionEnabled).toBe(true);
  });
});

it.each(["true", 1, null, {}, false])("training period capability rejects non-boolean runtime value %s", async value => {
  resetRuntimeConfigForTests({ trainingAnalysisPeriodsEnabled: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ trainingAnalysisPeriodsEnabled: value }) }));
  await loadRuntimeConfig(); expect(getRuntimeConfig().trainingAnalysisPeriodsEnabled).toBe(false);
});
