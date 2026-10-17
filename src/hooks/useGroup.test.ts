import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
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

describe("member directory failures",()=>{
  it("retains a successful roster on failure and recovers through its explicit retry",async()=>{
    let rejectSnapshot!:(reason:Error)=>void;
    vi.mocked(getPublicUserProfile).mockResolvedValue(profile("member"));
    vi.mocked(onSnapshot).mockImplementationOnce((...args)=>{
      const onNext=typeof args[1]==="function"?args[1]:args[2];
      const onError=typeof args[1]==="function"?args[2]:args[3];
      rejectSnapshot=onError as (reason:Error)=>void;
      if(typeof onNext==="function") onNext({docs:[{id:"member",data:()=>({role:"member"})}],metadata:{fromCache:false}} as never);
      return ()=>{};
    });
    const {result}=renderHook(()=>useGroupMembers("failure-club"));
    await waitFor(()=>expect(result.current.members[0]?.id).toBe("member"));
    const failure=new Error("offline");act(()=>rejectSnapshot(failure));
    expect(result.current.error).toBe(failure);expect(result.current.members[0]?.id).toBe("member");
    setCollectionDocs("groups/failure-club/members",[{id:"recovered",role:"member"}]);
    act(()=>result.current.retry());
    await waitFor(()=>expect(result.current.members[0]?.id).toBe("recovered"));expect(result.current.error).toBeNull();
  });
  it("marks a cache-only empty roster as unconfirmed rather than a successful empty list",async()=>{
    vi.mocked(onSnapshot).mockImplementationOnce((...args)=>{
      const onNext=typeof args[1]==="function"?args[1]:args[2];
      if(typeof onNext==="function")onNext({docs:[],metadata:{fromCache:true}} as never);return()=>{};
    });
    const {result}=renderHook(()=>useGroupMembers("uncached-club"));
    await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.error).toBeInstanceOf(Error);
  });
  it("still shows the roster when one optional public profile fails",async()=>{
    vi.mocked(getPublicUserProfile).mockRejectedValueOnce(new Error("profile offline"));
    setCollectionDocs("groups/profile-failure/members",[{id:"present",role:"member"}]);
    const {result}=renderHook(()=>useGroupMembers("profile-failure"));
    await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.members[0]?.id).toBe("present");expect(result.current.members[0]?.profile).toBeNull();
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
  it.each(["active", "approved"])("uses the canonical creator only as an active %s display fallback without extra reads", async status => {
    setDocData("groups/display-creator/members/creator", { status });
    const reads = vi.mocked(getDocs).mock.calls.length;
    const display = renderHook(() => useGroupMemberRole("display-creator", "creator", "creator"));
    const permission = renderHook(() => useGroupMemberRole("display-creator", "creator"));
    await waitFor(() => expect(display.result.current.loading).toBe(false));
    expect(display.result.current.role).toBe("leader");
    expect(permission.result.current.role).toBe("member");
    expect(vi.mocked(getDocs).mock.calls.length).toBe(reads);
    act(() => setDocData("groups/display-creator/members/creator", { status, role: "member" }));
    expect(display.result.current.role).toBe("member");
  });
  it.each([undefined, { status: "pending" }, { status: "removed" }, { status: "active", role: "unknown" }])("does not infer display leadership from unconfirmed membership %j", async data => {
    if (data) setDocData("groups/unconfirmed-creator/members/creator", data);
    const { result } = renderHook(() => useGroupMemberRole("unconfirmed-creator", "creator", "creator"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
  });

  it("tracks the current member role without loading the member list", async () => {
    setDocData("groups/group-1/members/member-1", { role: "co-leader", status: "active" });
    const { result } = renderHook(() => useGroupMemberRole("group-1", "member-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("co-leader");
  });

  it.each(["active", "approved"])("defaults only nullish roles on %s memberships to member", async status => {
    setDocData("groups/legacy/members/member", { status });
    const { result } = renderHook(() => useGroupMemberRole("legacy", "member"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("member");
    act(() => setDocData("groups/legacy/members/member", { status, role: null }));
    expect(result.current.role).toBe("member");
  });

  it.each([
    { status: "active", role: "unknown" },
    { status: "approved", role: "" },
    { status: "pending" },
    { status: "removed", role: "leader" },
    { role: "leader" },
  ])("fails closed for an invalid or inactive membership %j", async membership => {
    setDocData("groups/invalid/members/member", membership);
    const { result } = renderHook(() => useGroupMemberRole("invalid", "member"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
  });

  it("does not infer a creator role from a missing member document", async () => {
    setDocData("groups/creator", { creatorId: "creator" });
    const { result } = renderHook(() => useGroupMemberRole("creator", "creator"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
  });

  it("clears an existing role when the membership subscription fails", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      reject = args[3] as (error: Error) => void;
      const next = args[2] as (snap: unknown) => void;
      next({ exists: () => true, data: () => ({ status: "active", role: "leader" }) });
      return () => {};
    });
    const { result } = renderHook(() => useGroupMemberRole("failed", "leader"));
    expect(result.current.role).toBe("leader");
    act(() => reject(new Error("permission-denied")));
    expect(result.current.role).toBeNull();
    expect(result.current.loading).toBe(false);
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

  it("does not confirm an empty membership list from an offline cache", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
    const { result } = renderHook(() => useMyGroups("offline-user"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it("preserves known memberships on an empty cached retry and clears them for a different user", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: false } } as never)
      .mockResolvedValueOnce({ docs: [{ id: "known", data: () => ({ name: "Known club" }) }], metadata: { fromCache: false } } as never);
    const { result, rerender } = renderHook(({ uid }) => useMyGroups(uid), { initialProps: { uid: "known-user" } });
    await waitFor(() => expect(result.current.groups[0]?.id).toBe("known"));
    for (let i = 0; i < 4; i++) vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.groups[0]?.id).toBe("known");
    rerender({ uid: "another-user" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("keeps cached club rows usable while reporting their unconfirmed server state", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [{ id: "cached", data: () => ({ name: "Cached club" }) }], metadata: { fromCache: true } } as never);
    const { result } = renderHook(() => useMyGroups("cached-user"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups[0]?.id).toBe("cached");
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("distinguishes cached-empty public results from a server-confirmed empty directory", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [], metadata: { fromCache: false } } as never);
    const { result } = renderHook(() => usePublicGroups());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.groups).toEqual([]);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it("retains known public results on an offline retry but clears them when filters change", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [{ id: "public", data: () => ({ name: "Public club" }) }], metadata: { fromCache: false } } as never);
    const { result, rerender } = renderHook(({ city }) => usePublicGroups({ city }), { initialProps: { city: "Seoul" } });
    await waitFor(() => expect(result.current.groups[0]?.id).toBe("public"));
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.groups[0]?.id).toBe("public");
    rerender({ city: "Busan" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
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


describe("membership access changes", () => {
  it("resubscribes a denied group document when membership is approved", async () => {
    setDocData("groups/approval", { name: "Approved group", isActive: true });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    });
    const { result, rerender } = renderHook(({ accessKey }) => useGroup("approval", accessKey), { initialProps: { accessKey: "user:" } });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    rerender({ accessKey: "user:member" });
    await waitFor(() => expect(result.current.group?.name).toBe("Approved group"));
    expect(result.current.error).toBeNull();
  });

  it("resubscribes the denied member list after approval", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue(profile("approved"));
    setCollectionDocs("groups/approval/members", [{ id: "approved", role: "member" }]);
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(new Error("denied"));
      return () => {};
    });
    const { result, rerender } = renderHook(({ accessKey }) => useGroupMembers("approval", 8, accessKey), { initialProps: { accessKey: "user:" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.members).toEqual([]);
    rerender({ accessKey: "user:member" });
    await waitFor(() => expect(result.current.members.map(member => member.id)).toEqual(["approved"]));
  });
});

describe("cached absence is not confirmed nonmembership", () => {
  it("reports a cached missing club as unconfirmed, then accepts a server-confirmed absence", () => {
    let next!: (snapshot: unknown) => void;
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      next = args[2] as typeof next;
      next({ exists: () => false, metadata: { fromCache: true } });
      return () => {};
    });
    const { result } = renderHook(() => useGroup("cached-missing"));
    expect(result.current.group).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
    act(() => next({ exists: () => false, metadata: { fromCache: false } }));
    expect(result.current.error).toBeNull();
    expect(result.current.group).toBeNull();
    expect(onSnapshot).toHaveBeenCalledWith(expect.anything(), { includeMetadataChanges: true }, expect.any(Function), expect.any(Function));
  });

  it("keeps an existing cached club usable", () => {
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      (args[2] as (snapshot: unknown) => void)({ id: "cached", exists: () => true, data: () => ({ name: "Cached club", isActive: true }), metadata: { fromCache: true } });
      return () => {};
    });
    const { result } = renderHook(() => useGroup("cached"));
    expect(result.current.group?.name).toBe("Cached club");
    expect(result.current.error).toBeNull();
  });

  it("does not classify cached missing membership as confirmed nonmembership and can retry", async () => {
    setDocData("groups/cached/members/member", { status: "active" });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      (args[2] as (snapshot: unknown) => void)({ exists: () => false, metadata: { fromCache: true } });
      return () => {};
    });
    const { result } = renderHook(() => useGroupMemberRole("cached", "member"));
    expect(result.current.role).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.role).toBe("member"));
    expect(result.current.error).toBeNull();
  });

  it("accepts an active cached membership but distinguishes a subscription failure", () => {
    let reject!: (error: Error) => void;
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      reject = args[3] as typeof reject;
      (args[2] as (snapshot: unknown) => void)({ exists: () => true, data: () => ({ status: "active", role: "co-leader" }), metadata: { fromCache: true } });
      return () => {};
    });
    const { result } = renderHook(() => useGroupMemberRole("cached", "member"));
    expect(result.current.role).toBe("co-leader");
    expect(result.current.error).toBeNull();
    const failure = new Error("offline");
    act(() => reject(failure));
    expect(result.current.role).toBeNull();
    expect(result.current.error).toBe(failure);
  });
});
