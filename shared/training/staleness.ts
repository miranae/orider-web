/**
 * 훈련 데이터 신선도 임계값 — 클라/서버 공용 단일 소스.
 *
 * Cloud Functions 측은 functions/src/training/revalidate-rules.ts에서 이 값을
 * import 하지 못하므로(tsconfig include 제약) 같은 값을 mirror 한다.
 * **변경 시 두 파일 함께 수정.**
 */

export const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000;
