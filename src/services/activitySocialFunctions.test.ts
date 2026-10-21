import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { functions } from "./firebase";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: vi.fn(() => ({ appEnvironment: "production" })), isEmulatorRuntime: vi.fn(() => false) }));
beforeEach(() => { vi.resetModules(); vi.mocked(getFunctions).mockClear(); vi.mocked(connectFunctionsEmulator).mockClear(); vi.mocked(isEmulatorRuntime).mockReturnValue(false); vi.mocked(getRuntimeConfig).mockReturnValue({ appEnvironment: "production" } as never); });
afterEach(() => vi.unstubAllEnvs());
it("uses the social callable region lazily", async () => {
  const { getActivitySocialFunctions } = await import("./activitySocialFunctions");
  expect(getFunctions).not.toHaveBeenCalled();
  getActivitySocialFunctions();
  expect(getFunctions).toHaveBeenCalledWith(functions.app, "asia-northeast3");
});
it("preserves the existing isolated stage custom-base client", async () => {
  vi.mocked(getRuntimeConfig).mockReturnValue({ appEnvironment: "stage" } as never);
  const { getActivitySocialFunctions } = await import("./activitySocialFunctions");
  expect(getActivitySocialFunctions()).toBe(functions); expect(getFunctions).not.toHaveBeenCalled();
});
it("connects each regional emulator client once using the configured port", async () => {
  vi.mocked(isEmulatorRuntime).mockReturnValue(true); vi.stubEnv("VITE_FUNCTIONS_EMULATOR_PORT", "5123");
  const client = {} as ReturnType<typeof getFunctions>;
  vi.mocked(getFunctions).mockReturnValue(client);
  const { getActivitySocialFunctions } = await import("./activitySocialFunctions");
  getActivitySocialFunctions(); getActivitySocialFunctions();
  expect(connectFunctionsEmulator).toHaveBeenCalledOnce(); expect(connectFunctionsEmulator).toHaveBeenCalledWith(client, "localhost", 5123);
});
