import type { Auth } from "firebase/auth";

type SelectedPersistence = { type?: string; _isAvailable?: () => Promise<boolean> };

/**
 * 공개 Auth API에는 실제로 선택된 저장소 판정이 없다. SDK의 읽기 전용 어댑터 한 곳에서만
 * 확인한다. initializeAuth의 후보는 IndexedDB(LOCAL)와 메모리(NONE)뿐이다.
 * 고정된 firebase 12.16.0 / @firebase/auth 1.13.3에서 _getPersistence는 객체,
 * _getPersistenceType은 문자열이다(실제 설치 SDK 계약 테스트와 WebKit 검증).
 * 과거 판처럼 문자열을 반환하거나 내부 판정 API가 달라지면 false로 닫는다. 사용자·인증 상태를 바꾸거나 저장 키를 직접 읽지 않는다.
 */
export async function verifySelectedAuthPersistence(auth: Auth, timeoutMs = 2_000): Promise<boolean> {
  const inspect = async () => {
    await auth.authStateReady();
    const value = (auth as Auth & { _getPersistence?: () => unknown })._getPersistence?.();
    if (value === null || typeof value !== "object") return false;
    const selected = value as SelectedPersistence;
    if (selected.type !== "LOCAL" || typeof selected._isAvailable !== "function") return false;
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
