import type { Auth } from "firebase/auth";
import { describe, expect, it, vi } from "vitest";
import { verifySelectedAuthPersistence } from "./authPersistence";

const fixture = (type: string, available = vi.fn().mockResolvedValue(true)) => ({
  authStateReady: vi.fn().mockResolvedValue(undefined),
  _getPersistence: vi.fn().mockReturnValue({ type, _isAvailable: available }),
}) as unknown as Auth;

describe("실제 선택된 인증 저장소", () => {
  it("IndexedDB 선택과 실제 저장 검사가 모두 성공해야 영속 인증이다", async () => {
    expect(await verifySelectedAuthPersistence(fixture("LOCAL"))).toBe(true);
    expect(await verifySelectedAuthPersistence(fixture("NONE"))).toBe(false);
    expect(await verifySelectedAuthPersistence(fixture("LOCAL", vi.fn().mockResolvedValue(false)))).toBe(false);
  });
  it("SDK 판정 API가 없는 판은 보수적으로 영속 인증을 끈다", async () => {
    expect(await verifySelectedAuthPersistence({ authStateReady: async () => {} } as unknown as Auth)).toBe(false);
  });
  it("저장 실패는 호출부에 전달해 진단하고 메모리 흐름으로 복구한다", async () => {
    await expect(verifySelectedAuthPersistence(fixture("LOCAL", vi.fn().mockRejectedValue(new Error("storage-denied")))))
      .rejects.toThrow("storage-denied");
  });
  it("설치된 실제 Firebase SDK의 읽기 전용 판정 계약이 유지된다", async () => {
    const { initializeApp, deleteApp } = await import("@firebase/app");
    const { initializeAuth, inMemoryPersistence } = await import("@firebase/auth");
    const app = initializeApp({ apiKey: "unit-contract-key", authDomain: "unit.invalid", projectId: "unit-contract" }, "persistence-adapter-contract");
    try {
      const auth = initializeAuth(app, { persistence: inMemoryPersistence });
      await auth.authStateReady();
      const adapter = auth as typeof auth & { _getPersistence: () => { type: string; _isAvailable: () => Promise<boolean> } };
      expect(typeof adapter._getPersistence).toBe("function");
      expect(adapter._getPersistence().type).toBe("NONE");
      expect(typeof adapter._getPersistence()._isAvailable).toBe("function");
      expect(await verifySelectedAuthPersistence(auth)).toBe(false);
    } finally { await deleteApp(app); }
  });

  it("인증 초기화가 멈춰도 부트스트랩을 무한히 막지 않는다", async () => {
    const auth = { authStateReady: () => new Promise(() => {}) } as unknown as Auth;
    await expect(verifySelectedAuthPersistence(auth, 10)).rejects.toThrow("persistence-check-timeout");
  });
});
