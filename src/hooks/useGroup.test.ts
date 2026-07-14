import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUserProfile } from "../services/publicProfiles";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { getPublicUserProfile } from "../services/publicProfiles";
import * as errorLogger from "../services/errorLogger";
import { useGroup, useGroupMemberRole, useGroupMembers, useMyGroups, usePublicGroups } from "./useGroup";

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

  it("clears the previous group when the requested identity is removed", async () => {
    setDocData("groups/group-1", {
      name: "First Group",
      creatorId: "leader-1",
      isActive: true,
    });
    const { result, rerender } = renderHook(
      ({ groupId }: { groupId: string | undefined }) => useGroup(groupId),
      { initialProps: { groupId: "group-1" as string | undefined } },
    );
    await waitFor(() => expect(result.current.group?.id).toBe("group-1"));

    rerender({ groupId: undefined });
    expect(result.current.group).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("useGroupMemberRole", () => {
  it("tracks the current member role without loading the member list", async () => {
    setDocData("groups/group-1/members/member-1", { role: "co-leader", status: "active" });
    const { result } = renderHook(() => useGroupMemberRole("group-1", "member-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("co-leader");
  });
});

describe("group list hooks", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    vi.mocked(where).mockClear();
    vi.mocked(limit).mockClear();
    vi.mocked(orderBy).mockClear();
    vi.mocked(query).mockClear();
  });

  it("keeps my group load failures distinct from an empty group list", async () => {
    const err = new Error("network down");
    vi.mocked(getDocs).mockRejectedValueOnce(err).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 5_000 });

    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe(err);
  });

  it("discovers a group creator when the user_groups lookup index is missing", async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({
        docs: [{
          id: "creator-group",
          data: () => ({ name: "Created group", creatorId: "user-1", isActive: true }),
        }],
      } as never);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual(["creator-group"]);
    expect(where).toHaveBeenCalledWith("creatorId", "==", "user-1");
  });

  it("discovers the current group when the user_groups lookup index is missing", async () => {
    setDocData("users/user-1", { currentGroupId: "current-group" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({
        docs: [{
          id: "current-group",
          data: () => ({ name: "Current group", creatorId: "leader-1", isActive: true }),
        }],
      } as never);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual(["current-group"]);
    expect(where).toHaveBeenCalledWith("__name__", "in", ["current-group"]);
  });

  it("reports a current-group fetch failure when the creator fallback is empty", async () => {
    const permissionError = new Error("permission-denied");
    setDocData("users/user-1", { currentGroupId: "restricted-group" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockRejectedValueOnce(permissionError);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe(permissionError);
  });

  it("keeps creator groups when the user_groups source fails", async () => {
    const indexError = new Error("index unavailable");
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    vi.mocked(getDocs)
      .mockRejectedValueOnce(indexError)
      .mockResolvedValueOnce({
        docs: [{
          id: "creator-group",
          data: () => ({ name: "Created group", creatorId: "user-1", isActive: true }),
        }],
      } as never);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual(["creator-group"]);
    expect(result.current.error).toBeNull();
    expect(logSpy).toHaveBeenCalledWith("useMyGroups.partial", indexError, { userId: "user-1", source: "index" });
    logSpy.mockRestore();
  });

  it("keeps indexed groups when the creator source fails", async () => {
    const creatorError = new Error("creator query unavailable");
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "indexed-group" }] } as never)
      .mockRejectedValueOnce(creatorError)
      .mockResolvedValueOnce({
        docs: [{
          id: "indexed-group",
          data: () => ({ name: "Indexed group", creatorId: "leader-1", isActive: true }),
        }],
      } as never);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual(["indexed-group"]);
    expect(result.current.error).toBeNull();
  });

  it("logs a failed group chunk while keeping groups from successful chunks", async () => {
    const chunkError = new Error("chunk unavailable");
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const indexedIds = Array.from({ length: 11 }, (_, index) => ({ id: `group-${index + 1}` }));
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: indexedIds } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({
        docs: [{
          id: "group-1",
          data: () => ({ name: "Available group", creatorId: "leader-1", isActive: true }),
        }],
      } as never)
      .mockRejectedValueOnce(chunkError);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual(["group-1"]);
    expect(result.current.error).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "useMyGroups.partial",
      chunkError,
      { userId: "user-1", source: "discoveredChunk" },
    );
    logSpy.mockRestore();
  });

  it("ignores a late group response after the user changes", async () => {
    const firstIndex = deferred<{ docs: [] }>();
    const firstCreator = deferred<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>();
    vi.mocked(getDocs)
      .mockReturnValueOnce(firstIndex.promise as never)
      .mockReturnValueOnce(firstCreator.promise as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({
        docs: [{
          id: "second-user-group",
          data: () => ({ name: "Second user group", creatorId: "user-2", isActive: true }),
        }],
      } as never);

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string }) => useMyGroups(userId),
      { initialProps: { userId: "user-1" } },
    );
    rerender({ userId: "user-2" });
    await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual(["second-user-group"]));

    await act(async () => {
      firstIndex.resolve({ docs: [] });
      firstCreator.resolve({
        docs: [{
          id: "first-user-group",
          data: () => ({ name: "First user group", creatorId: "user-1", isActive: true }),
        }],
      });
      await Promise.all([firstIndex.promise, firstCreator.promise]);
    });

    expect(result.current.groups.map((group) => group.id)).toEqual(["second-user-group"]);
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

  it("does not query public groups while disabled for an unauthenticated page", () => {
    const { result } = renderHook(() => usePublicGroups({ enabled: false }));

    expect(getDocs).not.toHaveBeenCalled();
    expect(result.current.groups).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("applies directory and city filters on the server before the limit to avoid false-empty pages", async () => {
    renderHook(() => usePublicGroups({ searchText: "Han", discipline: "bike", city: "서울 · 잠실", maxCount: 30 }));

    await waitFor(() => {
      expect(getDocs).toHaveBeenCalled();
    });

    expect(where).toHaveBeenCalledWith("visibility", "==", "public");
    expect(where).toHaveBeenCalledWith("isActive", "==", true);
    expect(where).toHaveBeenCalledWith("toggles.showInDirectory", "==", true);
    expect(where).toHaveBeenCalledWith("discipline", "==", "bike");
    expect(where).toHaveBeenCalledWith("city", "==", "서울 · 잠실");
    expect(where).toHaveBeenCalledWith("name", ">=", "Han");
    expect(where).toHaveBeenCalledWith("name", "<=", "Han\uf8ff");
    expect(orderBy).toHaveBeenCalledWith("name");
    expect(limit).toHaveBeenCalledWith(30);
    const directoryFilterOrder = vi.mocked(where).mock.invocationCallOrder.find((_, index) =>
      vi.mocked(where).mock.calls[index]?.[0] === "toggles.showInDirectory");
    const cityFilterOrder = vi.mocked(where).mock.invocationCallOrder.find((_, index) =>
      vi.mocked(where).mock.calls[index]?.[0] === "city");
    expect(directoryFilterOrder).toBeLessThan(vi.mocked(limit).mock.invocationCallOrder.at(-1)!);
    expect(cityFilterOrder).toBeLessThan(vi.mocked(limit).mock.invocationCallOrder.at(-1)!);
    expect(query).toHaveBeenCalled();
  });
});
