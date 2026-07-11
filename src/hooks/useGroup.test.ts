import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUserProfile } from "../services/publicProfiles";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { getPublicUserProfile } from "../services/publicProfiles";
import { useGroup, useGroupMembers, useMyGroups, usePublicGroups } from "./useGroup";

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

describe("useGroup", () => {
  it("treats soft-deleted groups as unavailable", async () => {
    setDocData("groups/group-deleted", {
      name: "Deleted Group",
      creatorId: "leader-1",
      isActive: false,
    });

    const { result } = renderHook(() => useGroup("group-deleted"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.group).toBeNull();
    expect(result.current.inactive).toBe(true);
  });
});

describe("group list hooks", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
  });

  it("keeps my group load failures distinct from an empty group list", async () => {
    const err = new Error("network down");
    vi.mocked(getDocs).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 5_000 });

    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe(err);
  });

  it("keeps public group load failures distinct from no public groups", async () => {
    const err = new Error("permission denied");
    vi.mocked(getDocs).mockRejectedValueOnce(err);

    const { result } = renderHook(() => usePublicGroups());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe(err);
  });

  it("queries public groups with server-side search constraints and a limit", async () => {
    renderHook(() => usePublicGroups({ searchText: "Han", discipline: "bike", maxCount: 30 }));

    await waitFor(() => {
      expect(getDocs).toHaveBeenCalled();
    });

    expect(where).toHaveBeenCalledWith("visibility", "==", "public");
    expect(where).toHaveBeenCalledWith("isActive", "==", true);
    expect(where).toHaveBeenCalledWith("discipline", "==", "bike");
    expect(where).toHaveBeenCalledWith("name", ">=", "Han");
    expect(where).toHaveBeenCalledWith("name", "<=", "Han\uf8ff");
    expect(orderBy).toHaveBeenCalledWith("name");
    expect(limit).toHaveBeenCalledWith(30);
    expect(query).toHaveBeenCalled();
  });
});
