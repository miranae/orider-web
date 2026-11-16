import { afterEach, describe, expect, it, vi } from "vitest";

// 에뮬레이터 실행 — 콜러블 연결과 영수증 상태 조회가 같은 Functions 에뮬레이터 포트를 쓰는지 본다.
const mocks = vi.hoisted(() => ({
  appCheck: vi.fn(),
  connect: vi.fn(),
  deletionFunctions: { region: "asia-northeast3" },
}));
vi.mock("./firebase", () => ({ auth: { currentUser: null }, ensureAppCheckReady: vi.fn(), functions: { app: { options: { projectId: "demo-orider-lab" } } }, getAppCheckToken: mocks.appCheck, googleProvider: {} }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "e2e" }), isEmulatorRuntime: () => true }));
vi.mock("firebase/functions", () => ({ getFunctions: () => mocks.deletionFunctions, connectFunctionsEmulator: mocks.connect, httpsCallable: vi.fn() }));
vi.mock("firebase/auth", () => ({ reauthenticateWithPopup: vi.fn() }));
vi.mock("./socialAuth", () => ({ startSocialAuth: vi.fn(), listSocialLinks: vi.fn() }));

const receipt = "a".repeat(32) + "." + "b".repeat(64);
const completed = () => new Response(JSON.stringify({ result: { state: "complete", requestedAtMs: 1, completedAtMs: 2 } }));

async function loadAccountDeletion() {
  vi.resetModules();
  mocks.connect.mockReset();
  mocks.appCheck.mockReset().mockResolvedValue(null);
  return import("./accountDeletion");
}

describe("account deletion on the Functions emulator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses VITE_FUNCTIONS_EMULATOR_PORT for both the callable connection and the receipt status request", async () => {
    vi.stubEnv("VITE_FUNCTIONS_EMULATOR_PORT", "5599");
    const { getAccountDeletionStatus } = await loadAccountDeletion();
    expect(mocks.connect).toHaveBeenCalledWith(mocks.deletionFunctions, "localhost", 5599);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completed());
    await expect(getAccountDeletionStatus(receipt)).resolves.toMatchObject({ state: "complete" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5599/demo-orider-lab/asia-northeast3/getAccountDeletionStatus",
      expect.objectContaining({ method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" } }),
    );
  });

  it("keeps the default emulator port 5001 when the port is not configured", async () => {
    vi.stubEnv("VITE_FUNCTIONS_EMULATOR_PORT", "");
    const { getAccountDeletionStatus } = await loadAccountDeletion();
    expect(mocks.connect).toHaveBeenCalledWith(mocks.deletionFunctions, "localhost", 5001);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completed());
    await getAccountDeletionStatus(receipt);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:5001/demo-orider-lab/asia-northeast3/getAccountDeletionStatus");
  });
});
