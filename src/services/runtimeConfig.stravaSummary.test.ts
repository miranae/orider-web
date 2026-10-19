import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig, loadRuntimeConfig, resetRuntimeConfigForTests } from "./runtimeConfig";

afterEach(() => { vi.unstubAllGlobals(); resetRuntimeConfigForTests(); });

describe("Strava summary preview runtime gate", () => {
  it("defaults off, preserves the default for a missing remote key, and requires explicit boolean true", async () => {
    resetRuntimeConfigForTests();
    expect(getRuntimeConfig().stravaSummaryPreviewEnabled).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await loadRuntimeConfig();
    expect(getRuntimeConfig().stravaSummaryPreviewEnabled).toBe(false);
    resetRuntimeConfigForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stravaSummaryPreviewEnabled: true }) }));
    await loadRuntimeConfig();
    expect(getRuntimeConfig().stravaSummaryPreviewEnabled).toBe(true);
  });

  it.each(["true", 1, null, {}, false])("fails closed on invalid or disabled remote value %s", async value => {
    resetRuntimeConfigForTests({ stravaSummaryPreviewEnabled: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stravaSummaryPreviewEnabled: value }) }));
    await loadRuntimeConfig();
    expect(getRuntimeConfig().stravaSummaryPreviewEnabled).toBe(false);
  });
});
