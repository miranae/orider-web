/**
 * 충분도 노출 계측(기획 F2.18a, 개발설계서 §10) — `data_sufficiency_view`.
 *
 * 같은 블록 내용(digest)·기능·표시 형태는 탭 세션에서 한 번만 보낸다(리렌더 중복 제거).
 * 원시 uid·체중·FTP·활동 id 는 싣지 않는다. 서버 해제 로그와는 `subjectKey` 로 잇는다.
 * 위임 로그인 세션은 `delegated` 로 구분해 일반 퍼널에서 뺄 수 있게 한다.
 */
import type { SufficiencyBlock, SufficiencySet, SufficiencyState } from "@shared/types/sufficiency";
import { track } from "../../services/analytics";
import { readImpersonation } from "../../services/impersonation";

const sent = new Set<string>();

export function trackSufficiencyView(set: SufficiencySet, block: SufficiencyBlock, state: SufficiencyState,
  surface: "card" | "inline"): void {
  const key = [set.subjectKey, set.digest, block.featureId, block.viewId, surface, state].join("|");
  if (sent.has(key)) return;
  sent.add(key);
  track("data_sufficiency_view", {
    subject_key: set.subjectKey,
    owner_output: set.ownerOutput,
    feature_id: block.featureId,
    view_id: block.viewId,
    discipline: block.discipline,
    state,
    surface,
    remaining: block.remainingRequirementCount,
    action: block.nextAction?.code ?? "none",
    delegated: readImpersonation().status !== "none",
  });
}

/** 테스트 전용. */
export function resetSufficiencyViewDedupeForTest(): void {
  sent.clear();
}
