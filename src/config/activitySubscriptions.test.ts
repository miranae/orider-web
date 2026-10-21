import { isEmulatorRuntime } from "../services/runtimeConfig";
vi.mock("../services/runtimeConfig", () => ({ isEmulatorRuntime: vi.fn(() => false) }));
beforeEach(() => { vi.resetModules(); vi.mocked(isEmulatorRuntime).mockReturnValue(false); });
afterEach(() => vi.unstubAllEnvs());
it("permits production only with explicit UI and verified backend opt-ins", async () => {
  vi.stubEnv("DEV", false); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", "true"); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "true");
  const config = await import("./activitySubscriptions");
  expect(config.ACTIVITY_SUBSCRIPTIONS_ENABLED).toBe(true); expect(config.activitySubscriptionsBackendReady()).toBe(true);
});
it.each([undefined, "false"])("keeps production disabled when the UI opt-in is %s", async value => {
  vi.stubEnv("DEV", false); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", value); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "true");
  const config = await import("./activitySubscriptions");
  expect(config.ACTIVITY_SUBSCRIPTIONS_ENABLED).toBe(false); expect(config.activitySubscriptionsBackendReady()).toBe(false);
});
it("keeps production API calls disabled until backend readiness is confirmed", async () => {
  vi.stubEnv("DEV", false); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", "true"); vi.stubEnv("VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY", "false");
  const config = await import("./activitySubscriptions");
  expect(config.ACTIVITY_SUBSCRIPTIONS_ENABLED).toBe(true); expect(config.activitySubscriptionsBackendReady()).toBe(false);
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
