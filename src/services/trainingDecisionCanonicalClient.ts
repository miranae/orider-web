/**
 * canonical 훈련 결정 reader (#886 — 에픽 app#2237 의 L).
 *
 * callable `getTrainingDecision({ discipline })` 하나만 부른다. last-known-good 은 서버가
 * `users/{uid}/training/decision_{discipline}` 에 들고 있으므로 웹은 별도 캐시 문서를 읽지 않는다.
 *
 * ## 절대 던지지 않는다
 *
 * `canonicalApi.ts` 와 같은 규칙이다 — 이 계층이 예외를 던지면 호출부가 catch 에서 기본값을
 * 채우게 되고, 그게 이 에픽이 없애려는 결함이다. 모든 실패는 `failed`/`unavailable` 봉투다.
 */
import { httpsCallable } from "firebase/functions";

import { CANONICAL_SCHEMA_VERSION } from "@shared/types/canonical";
import { auth, ensureAppCheckReady, functions } from "./firebase";
import { debugLog, logClientError } from "./errorLogger";
import {
  parseTrainingDecisionEnvelope,
  type DecisionDiscipline,
  type TrainingDecisionEnvelope,
} from "./trainingDecisionCanonicalContract";

function clientEnvelope(
  status: "failed" | "unavailable",
  code: string,
  message: string,
  retryable: boolean,
): TrainingDecisionEnvelope {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    // 값이 없으므로 계산 로직도 없다. 서버 버전을 흉내 내지 않는다.
    algorithmVersion: "client_error",
    status,
    computedAt: null,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: null,
    // 클라이언트 실패에는 서버 판정이 없다 — 모름이지 중단이 아니다.
    rolloutEnabled: null,
    error: status === "failed" ? { code, message, retryable } : null,
  };
}

export async function fetchTrainingDecision(
  expectedUid: string,
  discipline: DecisionDiscipline,
): Promise<TrainingDecisionEnvelope> {
  if (auth.currentUser?.uid !== expectedUid) {
    // 미로그인·계정 전환은 실패가 아니라 "줄 값이 없다" 다.
    return clientEnvelope("unavailable", "unauthenticated", "로그인이 필요합니다", false);
  }
  try {
    await ensureAppCheckReady();
    const callable = httpsCallable<{ discipline: DecisionDiscipline }, unknown>(functions, "getTrainingDecision");
    const response = await callable({ discipline });
    // 응답을 기다리는 동안 계정이 바뀌면 다른 사용자의 결정을 그리지 않는다.
    if (auth.currentUser?.uid !== expectedUid) {
      return clientEnvelope("unavailable", "identity_changed", "계정이 변경되었습니다", false);
    }
    const envelope = parseTrainingDecisionEnvelope(response.data);
    logTrainingDecisionRead(discipline, envelope);
    return envelope;
  } catch (error) {
    logClientError("fetchTrainingDecision", error, { discipline });
    return clientEnvelope("failed", "call_failed", "훈련 결정을 불러오지 못했습니다", true);
  }
}

/** 부작용이 있는 읽기는 결과를 남긴다 — 어느 revision 을 그렸는지 없으면 화면 불일치를 추적할 수 없다. */
function logTrainingDecisionRead(discipline: DecisionDiscipline, envelope: TrainingDecisionEnvelope): void {
  debugLog("trainingDecision.read", {
    discipline,
    status: envelope.status,
    decisionRevision: envelope.data?.decisionRevision ?? null,
    band: envelope.data?.form.band.key ?? null,
  });
}
