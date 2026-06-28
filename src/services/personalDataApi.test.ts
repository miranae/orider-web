import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { auth } from "./firebase";
import {
  createPersonalApiKey,
  listPersonalApiKeys,
  revokePersonalApiKey,
} from "./personalDataApi";

type MockAuth = {
  currentUser?: {
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
});
