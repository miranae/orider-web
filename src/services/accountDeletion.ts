import { reauthenticateWithPopup } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions, getAppCheckToken, googleProvider } from "./firebase";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
import { startSocialAuth } from "./socialAuth";

const deletionFunctions = getRuntimeConfig().appEnvironment === "stage"
  ? functions : getFunctions(functions.app, "asia-northeast3");
if (isEmulatorRuntime() && deletionFunctions !== functions) connectFunctionsEmulator(deletionFunctions, "localhost", 5001);

export interface AccountDeletionStatus {
  state: "pending" | "processing" | "retrying" | "complete";
  requestedAtMs: number;
  completedAtMs?: number;
  archiveCleanupPending?: true;
  providerDeletionRequested?: true;
}

export interface AccountDeletionReceipt { owner: string; receipt: string }
const receiptKey = "orider.account-deletion.receipt.v1";
const receiptPattern = /^[a-f0-9]{32}\.[a-f0-9]{64}$/;
let memoryReceipt: AccountDeletionReceipt | null = null;

export function readAccountDeletionReceipt(uid?: string): AccountDeletionReceipt | null {
  let value = memoryReceipt;
  try {
    const stored = sessionStorage.getItem(receiptKey);
    if (stored) value = JSON.parse(stored) as AccountDeletionReceipt;
  } catch { /* 저장소 차단 시 이 탭의 메모리 영수증을 사용한다. */ }
  if (!value) return null;
  if (typeof value.owner !== "string" || !receiptPattern.test(value.receipt) || (uid && uid !== value.owner)) {
    memoryReceipt = null;
    try { sessionStorage.removeItem(receiptKey); } catch { /* 메모리 격리는 이미 적용했다. */ }
    return null;
  }
  memoryReceipt = value;
  return value;
}

export function saveAccountDeletionReceipt(owner: string, receipt: string): boolean {
  if (!receiptPattern.test(receipt)) throw new Error("INVALID_DELETION_RECEIPT");
  memoryReceipt = { owner, receipt };
  try {
    sessionStorage.setItem(receiptKey, JSON.stringify(memoryReceipt));
    return true;
  } catch { return false; }
}

export async function requestAccountDeletion(): Promise<AccountDeletionStatus & { receipt: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("SIGN_IN_REQUIRED");
  await ensureAppCheckReady();
  if (auth.currentUser?.uid !== uid) throw new Error("account_changed");
  const result = await httpsCallable<{ confirmation: string }, AccountDeletionStatus & { receipt: string }>(deletionFunctions, "requestAccountDeletion")({ confirmation: "DELETE" });
  return result.data;
}

export async function getAccountDeletionStatus(receipt?: string): Promise<AccountDeletionStatus | null> {
  if (receipt) {
    if (!receiptPattern.test(receipt)) throw new Error("INVALID_DELETION_RECEIPT");
    const appCheck = await getAppCheckToken();
    if (!appCheck && !isEmulatorRuntime()) throw new Error("app-check/empty-token");
    const config = getRuntimeConfig();
    const base = isEmulatorRuntime()
      ? `http://localhost:5001/${functions.app.options.projectId}/asia-northeast3`
      : config.appEnvironment === "stage" ? config.firebaseFunctionsBase
      : `https://asia-northeast3-${functions.app.options.projectId}.cloudfunctions.net`;
    if (!base) throw new Error("DELETION_ENDPOINT_UNAVAILABLE");
    const response = await fetch(`${base}/getAccountDeletionStatus`, {
      method: "POST", credentials: "omit",
      headers: { "Content-Type": "application/json", ...(appCheck ? { "X-Firebase-AppCheck": appCheck } : {}) },
      body: JSON.stringify({ data: { receipt } }),
    });
    const payload = await response.json() as { result?: AccountDeletionStatus; error?: unknown };
    const result = payload.result;
    if (!response.ok || payload.error || !result || !["pending", "processing", "retrying", "complete"].includes(result.state)
      || typeof result.requestedAtMs !== "number" || (result.state === "complete" && typeof result.completedAtMs !== "number")
      || (result.providerDeletionRequested !== undefined && result.providerDeletionRequested !== true)) {
      throw new Error("DELETION_STATUS_UNAVAILABLE");
    }
    return result;
  }
  await ensureAppCheckReady();
  try {
    const { data } = await httpsCallable<Record<string, never>, AccountDeletionStatus | { state: "none" }>(deletionFunctions, "getAccountDeletionStatus")({});
    return data.state === "none" ? null : data;
  } catch (error) {
    if ((error as { code?: string }).code === "functions/not-found") return null;
    throw error;
  }
}

export async function reauthenticateAccountDeletion(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("SIGN_IN_REQUIRED");
  // 네이버·카카오로만 로그인하는 계정은 Google 팝업으로 재인증할 수 없다 — 같은 서비스로
  // 다시 로그인하면 같은 uid 의 새 세션(auth_time 갱신)으로 이 페이지에 돌아온다.
  if (!user.providerData.some((p) => p.providerId === "google.com")) {
    const { claims } = await user.getIdTokenResult();
    const social = claims.socialProvider;
    if (social === "naver" || social === "kakao") {
      await startSocialAuth(social, "login", "/account-deletion");
      return;
    }
  }
  await reauthenticateWithPopup(user, googleProvider);
  await user.getIdToken(true);
}

export function requiresDeletionReauthentication(error: unknown): boolean {
  const value = error as { code?: string; details?: { reason?: string } } | null;
  return value?.code === "functions/failed-precondition" && value.details?.reason === "requires-recent-login";
}

export function requiresDeletionOwnerLogin(error: unknown): boolean {
  const value = error as { code?: string; details?: { reason?: string } } | null;
  return value?.code === "functions/permission-denied" && value.details?.reason === "requires-owner-login";
}
