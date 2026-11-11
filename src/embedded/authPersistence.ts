import type { Auth } from "firebase/auth";

type SelectedPersistence = { type?: string; _isAvailable?: () => Promise<boolean> };

/**
 * 공개 Auth API에는 실제로 선택된 저장소 판정이 없다. SDK의 읽기 전용 어댑터 한 곳에서만
 * 확인한다. initializeAuth의 후보는 IndexedDB(LOCAL)와 메모리(NONE)뿐이다.
 * 내부 판정 API가 달라지면 false로 닫는다. 사용자·인증 상태를 바꾸거나 저장 키를 직접 읽지 않는다.
 */
export async function verifySelectedAuthPersistence(auth: Auth, timeoutMs = 2_000): Promise<boolean> {
  const inspect = async () => {
    await auth.authStateReady();
    const selected = (auth as Auth & { _getPersistence?: () => SelectedPersistence })._getPersistence?.();
    if (selected?.type !== "LOCAL" || typeof selected._isAvailable !== "function") return false;
    // SDK 자체의 실제 저장/삭제 검사다. 저장소가 차단되거나 메모리로 폴백했으면 광고하지 않는다.
    return await selected._isAvailable() === true;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([inspect(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("embedded-auth/persistence-check-timeout")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
