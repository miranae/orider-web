import { isEmulatorRuntime } from "../services/runtimeConfig";
vi.mock("../services/runtimeConfig", () => ({ isEmulatorRuntime: vi.fn(() => false) }));
beforeEach(() => { vi.resetModules(); vi.mocked(isEmulatorRuntime).mockReturnValue(false); });
afterEach(() => vi.unstubAllEnvs());
it("keeps production disabled even if both opt-in variables are set", async () => {
  vi.stubEnv("DEV", false); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", "true"); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "true");
  const config = await import("./activitySubscriptions");
  expect(config.ACTIVITY_SUBSCRIPTIONS_ENABLED).toBe(false); expect(config.activitySubscriptionsBackendReady()).toBe(false);
});
it("separates the local UI opt-in from an undeployed backend", async () => {
  vi.stubEnv("DEV", true); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", "true"); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "false");
  const config = await import("./activitySubscriptions");
  expect(config.ACTIVITY_SUBSCRIPTIONS_ENABLED).toBe(true); expect(config.activitySubscriptionsBackendReady()).toBe(false);
});
it("permits an explicitly opted-in emulator without enabling production", async () => {
  vi.stubEnv("DEV", true); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", "true"); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "false");
  vi.mocked(isEmulatorRuntime).mockReturnValue(true);
  expect((await import("./activitySubscriptions")).activitySubscriptionsBackendReady()).toBe(true);
});
