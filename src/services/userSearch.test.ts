import { describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { ensureAppCheckReady } from "./firebase";
import { searchUsers } from "./userSearch";

const embedded = () => ({ auth: { currentUser: { uid: "embedded" } }, functions: { embedded: true }, ensureAppCheckReady: vi.fn() }) as unknown as FirebaseServices;

describe("사용자 검색 호출 (#1485)", () => {
  it("임베드 세션의 functions·App Check 로 호출하고 기본 웹 App Check 는 건드리지 않는다", async () => {
    const services = embedded();
    const defaultReadiness = vi.mocked(ensureAppCheckReady).mock.calls.length;
    setCallableResult("searchUsers", { data: { items: [{ id: "a" }], nextCursor: "c1" } });
    const result = await searchUsers("rider", null, services);
    expect(result).toEqual({ items: [{ id: "a" }], nextCursor: "c1" });
    expect(services.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(vi.mocked(ensureAppCheckReady).mock.calls.length).toBe(defaultReadiness);
    expect(httpsCallable).toHaveBeenLastCalledWith(services.functions, "searchUsers");
    expect(mockCallableInvocations.at(-1)).toEqual({ name: "searchUsers", data: { query: "rider", cursor: null } });
  });

  it("응답 사이에 임베드 계정이 바뀌면 이전 계정의 결과를 버린다", async () => {
    const services = embedded();
    setCallableImplementation("searchUsers", () => {
      (services.auth as unknown as { currentUser: unknown }).currentUser = { uid: "other" };
      return { data: { items: [{ id: "a" }], nextCursor: null } };
    });
    await expect(searchUsers("rider", null, services)).rejects.toThrow("account_changed");
  });
});
