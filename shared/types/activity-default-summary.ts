/** 서버가 정본 지표 준비 후 저장한다. 사용자 메모와 별개이며 모든 화면이 같은 값을 읽는다. */
export interface ActivityDefaultSummaryV1 {
  version: 1;
  formatterVersion: string;
  sourceRevision: string;
  inputDigest: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  text?: { ko: string; en: string };
  generatedAt?: number;
  attempts?: number;
  leaseUntil?: number;
  leaseToken?: string;
  errorCode?: string;
}
