/**
 * 임계값(FTP/LTHR/maxHR) 자동 제안 데이터 모델 — 웹/서버 공용.
 *
 * Firestore 경로: users/{uid}/threshold_suggestions/{activityId}
 * - 서버(Cloud Functions)가 활동 스트림 도착 시 작성
 * - 웹이 onSnapshot으로 읽어 배너 노출
 * - 사용자 수락은 acceptThresholdSuggestion onCall 경유 (rules: client write 차단)
 */

export interface ThresholdSuggestionField {
  /** 제안값 — round to int */
  proposed: number;
  /** 현재 프로필 값. 미설정이면 null. */
  current: number | null;
  /** 변화 정보 — FTP는 deltaPct, 심박은 delta */
  deltaPct?: number;
  delta?: number;
  /** UI에 노출할 짧은 사유 문자열 (한국어) */
  reason: string;
}

export interface ThresholdSuggestionDoc {
  activityId: string;
  ftp?: ThresholdSuggestionField;
  lthr?: ThresholdSuggestionField;
  maxHr?: ThresholdSuggestionField;
  createdAt: number;
  accepted?: boolean;
  acceptedAt?: number;
  acceptedFields?: Record<"ftp" | "lthr" | "maxHr", number>;
  dismissed?: boolean;
  dismissedAt?: number;
}
