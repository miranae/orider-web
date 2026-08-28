import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// `services/firebase` 는 `export { _firestore as firestore }` 형태의 **live binding** 이고,
// 실제 인스턴스는 main.tsx 가 렌더 전에 부르는 initFirebase() 에서야 채워진다.
// 이 목은 그 시점 차이를 그대로 재현한다 — 모듈 평가 시점엔 undefined, init 후에 채워짐.
const live = vi.hoisted(() => ({
  auth: undefined as unknown,
  firestore: undefined as unknown,
  functions: undefined as unknown,
}));

vi.mock("../services/firebase", () => ({
  get auth() { return live.auth; },
  get firestore() { return live.firestore; },
  get functions() { return live.functions; },
  ensureAppCheckReady: async () => {},
}));

// 컨텍스트 모듈은 여기서(= initFirebase 전에) 평가된다. 프로덕션의 import 순서와 같다.
import { FirebaseServicesProvider, useFirebaseServices, type FirebaseServices } from "./FirebaseServicesContext";

function initFirebase() {
  live.auth = { name: "auth" };
  live.firestore = { name: "firestore" };
  live.functions = { name: "functions" };
}

describe("useFirebaseServices", () => {
  it("Provider 없는 일반 웹 트리에서 initFirebase 이후의 실제 인스턴스를 준다", () => {
    // 회귀 #849: 기본값을 모듈 평가 시점에 스냅샷하면 firestore 가 undefined 로 굳어
    // 로그인 이후 표면 전체가 collection() 에서 던진다.
    initFirebase();

    const { result } = renderHook(() => useFirebaseServices());

    expect(result.current.firestore).toBe(live.firestore);
    expect(result.current.auth).toBe(live.auth);
    expect(result.current.functions).toBe(live.functions);
  });

  it("같은 인스턴스에 대해 안정된 참조를 유지한다", () => {
    initFirebase();

    const { result, rerender } = renderHook(() => useFirebaseServices());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  it("임베드는 주입된 services 로 기본값을 덮어쓴다", () => {
    initFirebase();
    const injected = {
      auth: { name: "embed-auth" },
      firestore: { name: "embed-firestore" },
      functions: { name: "embed-functions" },
      ensureAppCheckReady: async () => {},
    } as unknown as FirebaseServices;

    const { result } = renderHook(() => useFirebaseServices(), {
      wrapper: ({ children }) => (
        <FirebaseServicesProvider services={injected}>{children}</FirebaseServicesProvider>
      ),
    });

    expect(result.current).toBe(injected);
  });
});
