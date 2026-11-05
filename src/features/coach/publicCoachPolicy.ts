import type { CoachConsentPolicy, CoachDataCategory } from "../../services/coachConsentClient";

export type PublicCoachPolicy = Omit<CoachConsentPolicy, "consent">;

// Published policy v4, matching orider-g1-web/functions/src/coach/respond/consent.ts.
// Update this public document with the server policy whenever its version changes.
export function publicCoachPolicy(): PublicCoachPolicy {
const processingDataCategories: CoachDataCategory[] = ["user_question", "training_summary", "fitness_metrics", "active_goal", "workout_plan",
    "subjective_checkin", "readiness_snapshot"];
  const dataCategories: CoachDataCategory[] = ["user_question", "verified_answer", "answer_evidence", "thread_metadata",
    ...processingDataCategories.slice(1)];
  return {
    policyVersion: "ai-coach-policy-v4",
    title: "AI 코치 개인 운동 데이터 이용 동의",
    purpose: "질문에 답하기 위해 본인의 운동 데이터를 분석하고, 현재 웹 AI 코치에 계정 전용 대화 기록과 이어 묻기 문맥을 제공합니다.",
    dataCategories,
    retention: "AI 코치 질문, 검증된 답변과 대화 메타데이터는 사용자가 삭제할 때까지 저장합니다. 주간 주관적 체크인은 최대 365일, 처방 체크인 재시도 기록은 최대 30일 저장하며 동의 철회 시 즉시 삭제합니다. 질문·답변이 없는 삭제 표지는 최대 72시간 보관합니다. 이어 묻기는 최근 최대 3개 문답, 총 12KiB만 사용하며 원시 모델 출력, 시스템 프롬프트와 건강 원문은 로그에 기록하지 않습니다.",
    privacyPolicyUrl: "https://orider.co.kr/privacy",
    policyDocumentUrl: "https://orider.co.kr/policies/ai-coach",
    processor: {
      name: "Anthropic, PBC",
      service: "Claude API",
      privacyPolicyUrl: "https://www.anthropic.com/legal/privacy",
    },
    internationalProcessing: {
      recipient: "Anthropic, PBC",
      country: "United States",
      purpose: "사용자의 AI 코치 질문에 대한 답변 생성",
      dataCategories: [...processingDataCategories, "verified_answer", "answer_evidence"],
      timingAndMethod: "AI 코치 질문 시 암호화된 네트워크를 통한 전송",
      retention: "외부 처리자의 보존·삭제 조건은 AI 코치 정책 문서와 외부 처리자 개인정보 처리방침을 따릅니다.",
    },
    withdrawal: {
      method: "O·RIDER 설정의 AI 코치 데이터 이용 동의에서 철회",
      apiPath: "/v1/coach/consent",
      effect: "철회 즉시 새로운 AI 코치 처리를 차단하고 저장된 주간 체크인과 처방 체크인 재시도 기록을 삭제합니다. 기존 대화는 계속 조회하거나 삭제할 수 있습니다.",
    },
    changeSummary: {
      effectiveAt: "2026-07-20",
      summary: "웹과 앱이 공유하는 주간 주관적 체크인과 readiness snapshot의 처리, 365일 보존 및 동의 철회 시 삭제 범위를 추가했습니다.",
    },
  };

}
