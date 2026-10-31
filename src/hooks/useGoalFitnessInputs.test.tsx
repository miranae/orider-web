import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
const state = vi.hoisted(() => ({ call: vi.fn(), profile: {} }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u" }, profile: state.profile }) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => state.call }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ functions: {} }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
import { goalFitnessInputsSchema, useGoalFitnessInputs } from "./useGoalFitnessInputs";
const inputs = { ftp: 210, weightKg: 70, thresholdPace: 275, css: 108,
  ftpSource: "pdc_estimate", weightSource: "assumed", thresholdPaceSource: "assumed", cssSource: "assumed" };
beforeEach(() => { state.call.mockReset(); });
describe("goal wizard canonical input source", () => {
  it("reads validated PDC provenance from the server instead of using the stored 200W default", async () => {
    state.call.mockResolvedValue({ data: inputs });
    const hook = renderHook(useGoalFitnessInputs);
    await waitFor(() => expect(hook.result.current.ftp).toBe(210));
    expect(hook.result.current.ftpSource).toBe("pdc_estimate");
  });
  it("fails closed to visibly assumed inputs for malformed source values", async () => {
    state.call.mockResolvedValue({ data: { ...inputs, ftpSource: null } });
    const hook = renderHook(useGoalFitnessInputs);
    await waitFor(() => expect(state.call).toHaveBeenCalled());
    expect(hook.result.current.ftpSource).toBe("assumed");
    expect(goalFitnessInputsSchema.safeParse({ ...inputs, ftpSource: "other" }).success).toBe(false);
    expect(goalFitnessInputsSchema.safeParse({ ...inputs, ftp: Number.NaN }).success).toBe(false);
  });
});
