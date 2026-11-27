import { act, renderHook, waitFor } from "@testing-library/react";
import { getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublicClubs } from "../services/publicClubs";
import type { PublicUserProfile } from "../services/publicProfiles";
import { setCollectionDocs, setDocData, setCallableResult, setCallableImplementation } from "../__tests__/mocks/firebase";
import { getPublicUserProfile, getPublicUserProfiles } from "../services/publicProfiles";
import * as errorLogger from "../services/errorLogger";
import { useGroup, useGroupMemberRole, useGroupMembers, useMyGroups, usePublicGroups } from "./useGroup";

vi.mock("../services/publicClubs", () => ({ listPublicClubs: vi.fn(async () => ({ items: [], cursor: null, hasMore: false })) }));

vi.mock("../services/publicProfiles", () => ({
  getPublicUserProfile: vi.fn(),
  getPublicUserProfiles: vi.fn(async (ids: string[]) => new Map(await Promise.all(ids.map(async id => [id, await getPublicUserProfile(id)] as const)))),
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

  it("resolves a legacy secret-protected club detail without exposing its root", async () => {
    const denied = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    setCallableResult("resolveMyGroupSummaries", { data: { groups: [{ id: "legacy-club", name: "Legacy club", isActive: true }] } });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(denied as never);
      return () => {};
    });
    const { result } = renderHook(() => useGroup("legacy-club"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.group?.name).toBe("Legacy club");
    expect(result.current.error).toBeNull();
  });

  it("preserves inactive state even if a summary response contains an inactive club", async () => {
    setCallableResult("resolveMyGroupSummaries", { data: { groups: [{ id: "inactive-summary", isActive: false }] } });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(Object.assign(new Error("denied"), { code: "permission-denied" }) as never);
      return () => {};
    });
    const { result } = renderHook(() => useGroup("inactive-summary"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.group).toBeNull();
    expect(result.current.inactive).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("ignores a late legacy detail after navigation to another club", async () => {
    const pending = deferred<{ data: { groups: Array<{ id: string; name: string }> } }>();
    const callable = vi.fn(() => pending.promise);
    setCallableImplementation("resolveMyGroupSummaries", callable);
    const denied = Object.assign(new Error("denied"), { code: "permission-denied" });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(denied as never);
      return () => {};
    });
    const { result, rerender } = renderHook(({ id }) => useGroup(id), { initialProps: { id: "legacy-old" } });
    await waitFor(() => expect(callable).toHaveBeenCalled());
    setDocData("groups/new-club", { name: "New club", isActive: true });
    rerender({ id: "new-club" });
    await waitFor(() => expect(result.current.group?.id).toBe("new-club"));
    await act(async () => { pending.resolve({ data: { groups: [{ id: "legacy-old", name: "Old club" }] } }); await pending.promise; });
    expect(result.current.group?.id).toBe("new-club");
  });

  it("keeps a protected detail unavailable when the server does not confirm membership", async () => {
    const denied = Object.assign(new Error("denied"), { code: "permission-denied" });
    setCallableResult("resolveMyGroupSummaries", { data: { groups: [] } });
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      const onError = typeof args[1] === "function" ? args[2] : args[3];
      if (typeof onError === "function") onError(denied as never);
      return () => {};
    });
    const { result } = renderHook(() => useGroup("not-my-club"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.group).toBeNull();
    expect(result.current.error).toBe(denied);
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
  it.each([undefined, { status: "pending" }, { status: "removed" }])("does not infer display leadership from unconfirmed membership %j", async data => {
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
    { status: "active", role: "staff" },
  ])("keeps an active membership with an unknown role as a plain member %j", async membership => {
    // 서버 규칙은 역할과 관계없이 active/approved 회원 문서를 회원으로 본다 — 방문자로 떨어뜨리지 않는다.
    setDocData("groups/unknown-role/members/member", membership);
    const display = renderHook(() => useGroupMemberRole("unknown-role", "member", "member"));
    const permission = renderHook(() => useGroupMemberRole("unknown-role", "member"));
    await waitFor(() => expect(display.result.current.loading).toBe(false));
    await waitFor(() => expect(permission.result.current.loading).toBe(false));
    expect(display.result.current.role).toBe("member");
    expect(permission.result.current.role).toBe("member");
  });

  it.each([
    { status: "pending" },
    { status: "removed", role: "leader" },
    { role: "leader" },
  ])("fails closed for an inactive membership %j", async membership => {
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

/** 가입 목록은 정본 회원 문서가 active/approved 일 때만 확정된다(#1589). */
function activeMember(groupId: string, userId: string, status = "active") {
  setDocData(`groups/${groupId}/members/${userId}`, { status, role: "member" });
}

describe("group list hooks", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    vi.mocked(where).mockClear();
    vi.mocked(query).mockClear();
    vi.mocked(listPublicClubs).mockReset().mockResolvedValue({ items: [], cursor: null, hasMore: false });
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

  it("계정이 바뀌면 첫 렌더부터 이전 계정의 클럽 목록을 내보내지 않는다 (#1842)", async () => {
    activeMember("secret-club", "user-a");
    const pending = new Promise<never>(() => {});
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [{ id: "secret-club", data: () => ({ name: "비공개 클럽", creatorId: "user-a", isActive: true }) }] } as never)
      // B 의 조회는 끝나지 않게 둔다 — 남은 것은 렌더가 무엇을 내보내는지뿐이다.
      .mockReturnValueOnce(pending as never)
      .mockReturnValueOnce(pending as never);
    const renders: Array<{ uid: string; ids: string[]; loading: boolean }> = [];
    const { result, rerender } = renderHook(({ uid }) => {
      const value = useMyGroups(uid);
      renders.push({ uid, ids: value.groups.map((group) => group.id), loading: value.loading });
      return value;
    }, { initialProps: { uid: "user-a" } });
    await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual(["secret-club"]));

    rerender({ uid: "user-b" });
    const asB = renders.filter((entry) => entry.uid === "user-b");
    expect(asB.length).toBeGreaterThan(0);
    expect(asB.every((entry) => entry.ids.length === 0 && entry.loading)).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("discovers a group creator when the user_groups lookup index is missing", async () => {
    activeMember("creator-group", "user-1");
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
    expect(result.current.incomplete).toBe(false);
  });

  it("discovers the current group when the user_groups lookup index is missing", async () => {
    activeMember("current-group", "user-1");
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

  it("recovers a permission-denied indexed chunk through the canonical member projection", async () => {
    activeMember("legacy-club", "user-1");
    const denied = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [{ id: "legacy-club" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never).mockRejectedValueOnce(denied);
    setCallableResult("resolveMyGroupSummaries", { data: { groups: [{ id: "legacy-club", name: "My legacy club", isActive: true }] } });
    const { result } = renderHook(() => useMyGroups("user-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map(group => group.id)).toEqual(["legacy-club"]);
    expect(result.current.error).toBeNull();
    expect(result.current.incomplete).toBe(false);
  });

  it("does not call a projection failure a confirmed empty membership list", async () => {
    const denied = Object.assign(new Error("denied"), { code: "permission-denied" });
    const unavailable = new Error("membership service unavailable");
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [{ id: "legacy-club" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never).mockRejectedValueOnce(denied);
    setCallableImplementation("resolveMyGroupSummaries", () => { throw unavailable; });
    const { result } = renderHook(() => useMyGroups("user-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incomplete).toBe(true);
    expect(result.current.error).toBe(unavailable);
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
    activeMember("creator-group", "user-1");
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
    expect(result.current.incomplete).toBe(true);
    expect(logSpy).toHaveBeenCalledWith("useMyGroups.partial", indexError, { userId: "user-1", source: "index" }, expect.objectContaining({ functions: expect.anything() }));
    logSpy.mockRestore();
  });

  it("keeps indexed groups when the creator source fails", async () => {
    activeMember("indexed-group", "user-1");
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
    expect(result.current.incomplete).toBe(true);
  });

  it("logs a failed group chunk while keeping groups from successful chunks", async () => {
    activeMember("group-1", "user-1");
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
    expect(result.current.incomplete).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      "useMyGroups.partial",
      chunkError,
      { userId: "user-1", source: "discoveredChunk" },
      expect.objectContaining({ functions: expect.anything() }),
    );
    logSpy.mockRestore();
  });

  it("ignores a late group response after the user changes", async () => {
    activeMember("first-user-group", "user-1");
    activeMember("second-user-group", "user-2");
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

  it("lists only clubs whose canonical member document is active or approved", async () => {
    // 색인·현재 클럽 포인터·생성자 모두 후보일 뿐이다(#1589).
    setDocData("users/user-1", { currentGroupId: "left-current" });
    activeMember("indexed-active", "user-1");
    activeMember("indexed-approved", "user-1", "approved");
    setDocData("groups/indexed-unusual-role/members/user-1", { status: "active", role: "custom-role" });
    setDocData("groups/indexed-offline/members/user-1", { status: "offline", role: "member" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: ["indexed-active", "indexed-approved", "indexed-unusual-role", "indexed-offline", "kicked"].map(id => ({ id })) } as never)
      .mockResolvedValueOnce({ docs: [{ id: "handed-over", data: () => ({ name: "Handed over", creatorId: "user-1", isActive: true }) }] } as never)
      .mockResolvedValueOnce({ docs: ["indexed-active", "indexed-approved", "indexed-unusual-role", "indexed-offline", "kicked", "left-current"]
        .map(id => ({ id, data: () => ({ name: id, isActive: true }) })) } as never);

    const { result } = renderHook(() => useMyGroups("user-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map(group => group.id).sort()).toEqual(["indexed-active", "indexed-approved", "indexed-unusual-role"]);
    expect(result.current.incomplete).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps an unreadable membership unconfirmed instead of calling it a non-member", async () => {
    activeMember("readable", "user-1");
    const original = vi.mocked(getDoc).getMockImplementation()!;
    const denied = new Error("membership read failed");
    vi.mocked(getDoc).mockImplementation(async (ref: never) => {
      if ((ref as { path: string }).path === "groups/unreadable/members/user-1") throw denied;
      return original(ref);
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "readable" }, { id: "unreadable" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: ["readable", "unreadable"].map(id => ({ id, data: () => ({ name: id, isActive: true }) })) } as never);

    try {
      const { result } = renderHook(() => useMyGroups("user-1"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.groups.map(group => group.id)).toEqual(["readable"]);
      // 목록 밖 클럽을 미가입으로 확정하지 않는다 — 가입 버튼을 다시 열지 않게 incomplete.
      expect(result.current.incomplete).toBe(true);
    } finally {
      vi.mocked(getDoc).mockImplementation(original);
    }
  });

  it("reports a membership lookup failure instead of an empty joined list when nothing is confirmed", async () => {
    const original = vi.mocked(getDoc).getMockImplementation()!;
    const failure = new Error("membership read failed");
    vi.mocked(getDoc).mockImplementation(async (ref: never) => {
      if ((ref as { path: string }).path.includes("/members/")) throw failure;
      return original(ref);
    });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "only" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [{ id: "only", data: () => ({ name: "only", isActive: true }) }] } as never);

    try {
      const { result } = renderHook(() => useMyGroups("user-1"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.groups).toEqual([]);
      expect(result.current.error).toBe(failure);
      expect(result.current.incomplete).toBe(true);
    } finally {
      vi.mocked(getDoc).mockImplementation(original);
    }
  });

  it("does not revive a club confirmed as left when a cached source merges the previous list", async () => {
    activeMember("stay", "user-1");
    activeMember("left", "user-1");
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "stay" }, { id: "left" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: ["stay", "left"].map(id => ({ id, data: () => ({ name: id, isActive: true }) })) } as never);
    const { result } = renderHook(() => useMyGroups("user-1"));
    await waitFor(() => expect(result.current.groups.map(group => group.id).sort()).toEqual(["left", "stay"]));

    // 탈퇴 뒤 재조회: 색인은 캐시 응답이지만 정본 회원 문서는 서버에서 비회원으로 확인된다.
    setDocData("groups/left/members/user-1", { status: "left", role: "member" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "stay" }, { id: "left" }], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: ["stay", "left"].map(id => ({ id, data: () => ({ name: id, isActive: true }) })) } as never);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.groups.map(group => group.id)).toEqual(["stay"]);
  });

  it("removes the last club confirmed as left even when a cached source turns the refresh into an error", async () => {
    activeMember("only", "user-1");
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "only" }] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [{ id: "only", data: () => ({ name: "only", isActive: true }) }] } as never);
    const { result } = renderHook(() => useMyGroups("user-1"));
    await waitFor(() => expect(result.current.groups.map(group => group.id)).toEqual(["only"]));

    setDocData("groups/only/members/user-1", { status: "left", role: "member" });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: "only" }], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [{ id: "only", data: () => ({ name: "only", isActive: true }) }] } as never);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.groups).toEqual([]);
  });

  it("keeps public group load failures distinct from no public groups", async () => {
    const err = new Error("permission denied");
    vi.mocked(listPublicClubs).mockRejectedValueOnce(err);

    const { result } = renderHook(() => usePublicGroups());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe(err);
  });

  it("reconfirms membership when an identical embedded cache snapshot reaches the server", async () => {
    let notify!: (snapshot: unknown) => void;
    vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
      notify = args[2] as typeof notify;
      notify({ metadata: { fromCache: true }, docs: [] });
      return () => {};
    });
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
    const { result } = renderHook(() => useMyGroups("embedded-user"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incomplete).toBe(true);
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: false } } as never)
      .mockResolvedValueOnce({ docs: [], metadata: { fromCache: false } } as never);
    act(() => notify({ metadata: { fromCache: false }, docs: [] }));
    await waitFor(() => expect(result.current.incomplete).toBe(false));
    expect(result.current.error).toBeNull();
    expect(getDocs).toHaveBeenCalledTimes(4);
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
    activeMember("known", "known-user");
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
    activeMember("cached", "cached-user");
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never)
      .mockResolvedValueOnce({ docs: [{ id: "cached", data: () => ({ name: "Cached club" }) }], metadata: { fromCache: true } } as never);
    const { result } = renderHook(() => useMyGroups("cached-user"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups[0]?.id).toBe("cached");
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("uses the public HTTP directory for signed-in discovery instead of protected root queries", async () => {
    vi.mocked(listPublicClubs).mockResolvedValueOnce({ items: [{ id: "public", name: "Public club", description: "", approval: "auto" }], cursor: null, hasMore: false });
    const { result } = renderHook(() => usePublicGroups());
    await waitFor(() => expect(result.current.groups[0]?.id).toBe("public"));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("hides stale public results when a visibility recheck fails", async () => {
    vi.mocked(listPublicClubs).mockResolvedValueOnce({ items: [{ id: "public", name: "Public club", description: "", approval: "auto" }], cursor: null, hasMore: false });
    const { result } = renderHook(() => usePublicGroups());
    await waitFor(() => expect(result.current.groups[0]?.id).toBe("public"));
    vi.mocked(listPublicClubs).mockRejectedValueOnce(new Error("directory unavailable"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.groups).toEqual([]);
  });

  it("does not load disabled public discovery", () => {
    const { result } = renderHook(() => usePublicGroups({ enabled: false }));
    expect(listPublicClubs).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("forwards search, sport and city and keeps the HTTP continuation cursor", async () => {
    vi.mocked(listPublicClubs).mockResolvedValueOnce({ items: [{ id: "one", name: "One", description: "", approval: "auto" }], cursor: "next-http-page", hasMore: true })
      .mockResolvedValueOnce({ items: [{ id: "two", name: "Two", description: "", approval: "manual" }], cursor: null, hasMore: false });
    const filters = { searchText: "Han", discipline: "bike" as const, city: "서울 · 잠실" };
    const { result } = renderHook(() => usePublicGroups(filters));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(listPublicClubs).toHaveBeenCalledWith(filters, null);
    await act(async () => { await result.current.loadMore(); });
    await waitFor(() => expect(result.current.groups.map(g => g.id)).toEqual(["one", "two"]));
    expect(listPublicClubs).toHaveBeenCalledWith(filters, "next-http-page");
    expect(getDocs).not.toHaveBeenCalled();
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


it.each(["missing", "failed"])("clears an expired member profile when its recheck is %s", async outcome => {
  vi.mocked(getPublicUserProfiles).mockResolvedValueOnce(new Map([["member", profile("member")]]));
  setCollectionDocs("groups/cache-recheck/members", [{ id: "member", status: "active" }]);
  const { result } = renderHook(() => useGroupMembers("cache-recheck"));
  await waitFor(() => expect(result.current.members[0]?.profile?.nickname).toBe("member"));
  if (outcome === "missing") vi.mocked(getPublicUserProfiles).mockResolvedValueOnce(new Map());
  else vi.mocked(getPublicUserProfiles).mockRejectedValueOnce(new Error("backend failed"));
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
  try {
    act(() => setCollectionDocs("groups/cache-recheck/members", [{ id: "member", status: "active", updatedAt: 1 }]));
    await waitFor(() => expect(result.current.members[0]?.profile).toBeNull());
  } finally { clock.mockRestore(); }
});


it("keeps successful profiles in a partial roster response", async () => {
  vi.mocked(getPublicUserProfiles).mockResolvedValueOnce(new Map([["good", profile("good")]]));
  setCollectionDocs("groups/partial/members", [{ id: "good" }, { id: "failed" }]);
  const { result } = renderHook(() => useGroupMembers("partial"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.members.find(member => member.id === "good")?.profile?.nickname).toBe("good");
  expect(result.current.members.find(member => member.id === "failed")?.profile).toBeNull();
  expect(getPublicUserProfiles).toHaveBeenLastCalledWith(expect.any(Array), expect.anything(), expect.anything(), { onReadError: expect.any(Function) });
});
