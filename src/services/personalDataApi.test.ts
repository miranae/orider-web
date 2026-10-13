import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { auth, getAppCheckToken } from "./firebase";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import {
  createPersonalApiKey,
  getActivityStreams,
  listPersonalApiKeys,
  revokePersonalApiKey,
} from "./personalDataApi";

type MockAuth = {
  currentUser?: {
    uid?: string;
    getIdToken: ReturnType<typeof vi.fn>;
  } | null;
};

const mockAuth = auth as unknown as MockAuth;

function responseJson(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe("personalDataApi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockAuth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("test-id-token"),
    };
    vi.mocked(getAppCheckToken).mockReset().mockResolvedValue("personal-app-check");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    mockAuth.currentUser = null;
    vi.unstubAllGlobals();
  });

  it("requires a signed-in Firebase user before making requests", async () => {
    mockAuth.currentUser = null;

    await expect(listPersonalApiKeys()).rejects.toThrow("SIGN_IN_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes an empty key-list response to an empty array", async () => {
    fetchMock.mockResolvedValueOnce(responseJson({}));

    await expect(listPersonalApiKeys()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/developer/api-keys",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-id-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("surfaces server error messages from failed requests", async () => {
    fetchMock.mockResolvedValueOnce(responseJson(
      { error: { message: "API temporarily unavailable" } },
      { ok: false, status: 503 },
    ));

    await expect(listPersonalApiKeys()).rejects.toThrow("API temporarily unavailable");
  });

  it("throws a clear error when key creation returns malformed data", async () => {
    fetchMock.mockResolvedValueOnce(responseJson({ data: {} }));

    await expect(createPersonalApiKey({
      name: "Demo dashboard",
      scopes: ["activities:read"],
    })).rejects.toThrow("INVALID_PERSONAL_API_RESPONSE");
  });

  it("handles revoked or missing keys as failed revoke requests", async () => {
    fetchMock.mockResolvedValueOnce(responseJson(
      { error: { message: "API key revoked or not found" } },
      { ok: false, status: 404 },
    ));

    await expect(revokePersonalApiKey("key/revoked")).rejects.toThrow("API key revoked or not found");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/developer/api-keys/key%2Frevoked",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("loads GCS-backed activity streams through the authenticated REST endpoint", async () => {
    const streams = { time: [0, 1], altitude: [12, 13] };
    fetchMock.mockResolvedValueOnce(responseJson({ data: streams }));

    await expect(getActivityStreams("activity/with spaces")).resolves.toEqual(streams);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/activities/activity%2Fwith%20spaces/streams",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-id-token" }),
      }),
    );
  });

  it("surfaces REST errors while loading GCS-backed activity streams", async () => {
    fetchMock.mockResolvedValueOnce(responseJson(
      { error: { message: "Stream data file not available" } },
      { ok: false, status: 404 },
    ));

    await expect(getActivityStreams("missing-activity")).rejects.toThrow(
      "Stream data file not available",
    );
  });
});


describe("personal API App Check readiness", () => {
  beforeEach(() => resetRuntimeConfigForTests({ appEnvironment: "stage", personalApiBase: "https://qapersonalapi-ldfyfyx5da-du.a.run.app" }));
  afterEach(() => resetRuntimeConfigForTests());
  afterEach(() => vi.unstubAllGlobals());
  it("does not dispatch when token retrieval fails", async () => {
    mockAuth.currentUser = { uid: "owner", getIdToken: vi.fn(async () => "id") };
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("app-check/failed"));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(listPersonalApiKeys()).rejects.toThrow("app-check/failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send the old account token after switching while App Check is pending", async () => {
    mockAuth.currentUser = { uid: "owner", getIdToken: vi.fn(async () => "owner-id") };
    let finish!: (token: string) => void;
    vi.mocked(getAppCheckToken).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const request = listPersonalApiKeys();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    mockAuth.currentUser = { uid: "other", getIdToken: vi.fn(async () => "other-id") };
    finish("app-check");
    await expect(request).rejects.toThrow("account_changed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


it("does not return private key results after switching accounts during the API response", async () => {
  mockAuth.currentUser = { uid: "owner", getIdToken: vi.fn(async () => "owner-id") };
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const request = listPersonalApiKeys();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  mockAuth.currentUser = { uid: "other", getIdToken: vi.fn(async () => "other-id") };
  finish(responseJson({ data: [{ id: "private-owner-key" }] }));
  await expect(request).rejects.toThrow("account_changed");
  vi.unstubAllGlobals();
});


it("sends App Check only to the exact protected stage API and keeps production headers unchanged", async () => {
  mockAuth.currentUser = { uid: "owner", getIdToken: vi.fn(async () => "id") };
  vi.mocked(getAppCheckToken).mockReset().mockResolvedValue("stage-app-check");
  const fetchMock = vi.fn(async () => responseJson({ data: [] })); vi.stubGlobal("fetch", fetchMock);
  resetRuntimeConfigForTests({ appEnvironment: "stage", personalApiBase: "https://qapersonalapi-ldfyfyx5da-du.a.run.app" });
  await listPersonalApiKeys();
  expect(fetchMock).toHaveBeenLastCalledWith("https://qapersonalapi-ldfyfyx5da-du.a.run.app/api/v1/developer/api-keys", expect.objectContaining({ headers: expect.objectContaining({ "X-Firebase-AppCheck": "stage-app-check", Authorization: "Bearer id" }) }));
  resetRuntimeConfigForTests({ personalApiBase: "https://api.example" });
  vi.mocked(getAppCheckToken).mockClear();
  await listPersonalApiKeys();
  expect(getAppCheckToken).not.toHaveBeenCalled();
  expect(fetchMock.mock.lastCall?.[1].headers).not.toHaveProperty("X-Firebase-AppCheck");
  resetRuntimeConfigForTests(); vi.unstubAllGlobals();
});


it("does not dispatch a protected stage request without a token", async () => {
  resetRuntimeConfigForTests({ appEnvironment: "stage", personalApiBase: "https://qapersonalapi-ldfyfyx5da-du.a.run.app" });
  mockAuth.currentUser = { uid: "owner", getIdToken: vi.fn(async () => "id") };
  vi.mocked(getAppCheckToken).mockReset().mockResolvedValue(null);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(listPersonalApiKeys()).rejects.toThrow("app-check/empty-token");
  expect(fetchMock).not.toHaveBeenCalled();
  resetRuntimeConfigForTests(); vi.unstubAllGlobals();
});
