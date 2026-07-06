import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUserProfile } from "../services/publicProfiles";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { getPublicUserProfile } from "../services/publicProfiles";
import { useGroupMembers } from "./useGroup";

vi.mock("../services/publicProfiles", () => ({
  getPublicUserProfile: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function profile(id: string): PublicUserProfile {
  return { id, nickname: id, photoURL: null };
}

describe("useGroupMembers", () => {
  beforeEach(() => {
    vi.mocked(getPublicUserProfile).mockReset();
  });

  it("ignores older snapshot results that resolve after a newer snapshot", async () => {
    const slowProfileA = deferred<PublicUserProfile | null>();
    vi.mocked(getPublicUserProfile).mockImplementation((userId: string) => {
      if (userId === "member-a") return slowProfileA.promise;
      return Promise.resolve(profile(userId));
    });

    setCollectionDocs("groups/group-1/members", [
      { id: "member-a", role: "member" },
      { id: "member-b", role: "member" },
    ]);

    const { result } = renderHook(() => useGroupMembers("group-1"));

    act(() => {
      setCollectionDocs("groups/group-1/members", [
        { id: "member-b", role: "member" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.members.map((member) => member.id)).toEqual(["member-b"]);

    await act(async () => {
      slowProfileA.resolve(profile("member-a"));
      await slowProfileA.promise;
    });

    expect(result.current.members.map((member) => member.id)).toEqual(["member-b"]);
  });
});
