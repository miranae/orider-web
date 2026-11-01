import { afterEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../../../services/runtimeConfig";
import { firstWorkoutLocalAvailable } from "./firstWorkoutClient";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetRuntimeConfigForTests(); });
describe("first workout local boundary", () => {
  it("requires a dev build, loopback, explicit opt-in and the isolated demo project", () => {
    vi.stubEnv("DEV", true); vi.stubEnv("VITE_FIRST_WORKOUT_LOCAL_PREVIEW", "true");
    vi.stubGlobal("location", { hostname: "127.0.0.1" });
    resetRuntimeConfigForTests({ useEmulators: true, firebaseProjectId: "demo-orider-onboarding" });
    expect(firstWorkoutLocalAvailable()).toBe(true);
    resetRuntimeConfigForTests({ useEmulators: true, firebaseProjectId: "miranae-orider-g1" });
    expect(firstWorkoutLocalAvailable()).toBe(false);
    resetRuntimeConfigForTests({ useEmulators: true, firebaseProjectId: "demo-orider-onboarding" });
    vi.stubGlobal("location", { hostname: "orider.co.kr" });
    expect(firstWorkoutLocalAvailable()).toBe(false);
    vi.stubGlobal("location", { hostname: "127.0.0.1" }); vi.stubEnv("DEV", false);
    expect(firstWorkoutLocalAvailable()).toBe(false);
    vi.stubEnv("DEV", true); vi.stubEnv("VITE_FIRST_WORKOUT_LOCAL_PREVIEW", "false");
    expect(firstWorkoutLocalAvailable()).toBe(false);
  });
});
