/** 검증용 Admin 발급 attestation. JWT는 UID/호스트에 결합되지 않고 SDK 캐시에 저장될 수 있다. */
export const STAGE_QA_APP_CHECK_ORIGIN = "https://miranae-orider-g1-stage.web.app";
export const STAGE_QA_APP_CHECK_ENDPOINT = "https://asia-northeast3-orider-dev.cloudfunctions.net/consumeStageDelegatedQaAppCheckGrant";
export const STAGE_QA_APP_CHECK_APP_ID = "1:289663940841:web:ba08cdae154286e6499878";
export const STAGE_QA_APP_CHECK_SESSION_MS = 5 * 60 * 1000;
export const STAGE_QA_APP_CHECK_TOKEN_MS = 30 * 60 * 1000;
export interface StageDelegatedQaAppCheckResponse {
  version: 1;
  token: string;
  targetUid: string;
  delegatedBy: string;
  sessionExpiresAtMillis: number;
  tokenExpiresAtMillis: number;
}
