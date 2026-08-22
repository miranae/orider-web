import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase";
import { logClientError } from "./errorLogger";

export type FtpChangeSource = "manual" | "test" | "detected";

export interface UpdateFtpResult {
  ok: true;
  applied: boolean;
  ftp: number | null;
  mutationId: string;
  cacheSync: "async";
}

/**
 * 현재 FTP를 변경하는 유일한 웹 쓰기 경로.
 *
 * 서버가 프로필 정본, 변경 이력, training profile 및 기기 캐시 전파를 담당한다.
 * 클라이언트가 기기별 settings 문서를 먼저 쓰면 부분 실패나 오래된 기기의 역미러가
 * 정본을 되돌릴 수 있으므로 여기서는 canonical command만 호출한다.
 */
export async function updateCanonicalFtp(
  expectedUid: string,
  ftp: number | null,
  source: FtpChangeSource,
  mutationId = crypto.randomUUID(),
): Promise<UpdateFtpResult> {
  const callable = httpsCallable<
    { expectedUid: string; ftp: number | null; source: FtpChangeSource; mutationId: string },
    UpdateFtpResult
  >(functions, "updateFtp");
  try {
    const result = await callable({ expectedUid, ftp, source, mutationId });
    return result.data;
  } catch (error) {
    logClientError("ftpProfileClient.updateCanonicalFtp", error, {
      operation: "updateFtp",
      expectedUid,
      ftp,
      source,
      mutationId,
    });
    throw error;
  }
}
