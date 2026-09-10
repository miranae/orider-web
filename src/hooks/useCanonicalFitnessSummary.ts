/**
 * 피트니스 요약 canonical consumer 훅 (#884/#891 의 E — 에픽 app#2237).
 *
 * `useCanonicalHomeSummary` 와 같은 규칙이다: **빌드 플래그 AND 서버 전환 판정
 * (`homeSummary`)**, 판정 전에는 아무것도 부르지 않고, `values` 가 null 이면 화면은
 * 숫자를 그리지 않는다.
 *
 * 홈의 CTL/TSB KPI 와 같은 면(`homeSummary`)에 묶여 있다 — 같은 화면의 같은 줄에 서는
 * 숫자들이라 따로 켜고 끄면 한 줄 안에서 서버 값과 클라 집계가 섞인다.
 *
 * 응답 페이로드의 모양은 [parseCanonicalFitnessSummary] 가 판단한다. 기대한 모양이
 * 아니면 값 없음이다 — 0 으로 채우지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { decideCanonicalRender, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { useAuth } from "../contexts/AuthContext";
import { logClientError } from "../services/errorLogger";
import {
  canonicalConsumersEnabled,
  fetchCanonicalFitnessSummary,
  parseCanonicalFitnessSummary,
  type CanonicalFitnessSummaryData,
} from "../services/canonicalApi";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

export interface CanonicalFitnessSummaryState {
  /** false 면 화면은 오늘과 똑같이 클라 계산을 그린다. */
  enabled: boolean;
  /** null 이면 **숫자를 그리지 않는다.** */
  values: CanonicalFitnessSummaryData | null;
  display: CanonicalDisplay | null;
  computedAt: number | null;
}

const DISABLED: CanonicalFitnessSummaryState = {
  enabled: false, values: null, display: null, computedAt: null,
};

export function useCanonicalFitnessSummary(): CanonicalFitnessSummaryState {
  const { user } = useAuth();
  const rollout = useCanonicalRollout();
  const enabled = canonicalConsumersEnabled() && canonicalRolloutAllows(rollout, "homeSummary");
  const [state, setState] = useState<CanonicalFitnessSummaryState>(DISABLED);
  const lastGood = useRef<CanonicalFitnessSummaryData | null>(null);
  // 늦게 도착한 응답이 최신을 덮지 않게 한다 (A→B→A 전환 포함).
  const generation = useRef(0);

  const load = useCallback(async (uid: string, myGeneration: number) => {
    const envelope = await fetchCanonicalFitnessSummary();
    if (generation.current !== myGeneration) return;
    const parsed = parseCanonicalFitnessSummary(envelope.data);
    if (envelope.data !== null && parsed === null) {
      // 값이 실려 왔는데 읽을 수 없다 — 조용히 빈 화면으로 넘기지 않고 남긴다.
      logClientError("useCanonicalFitnessSummary.shape", new Error("unexpected fitness summary payload"), { uid });
    }
    const decision = decideCanonicalRender(envelope, lastGood.current !== null);
    if (decision.contractViolations.length > 0) {
      logClientError("useCanonicalFitnessSummary.contract", new Error(decision.contractViolations.join("; ")), { uid });
    }
    if (parsed !== null && decision.display === "value") lastGood.current = parsed;
    setState({
      enabled: true,
      values: parsed ?? (decision.display === "value_with_stale_hint" ? lastGood.current : null),
      display: decision.display,
      computedAt: envelope.computedAt,
    });
  }, []);

  useEffect(() => {
    generation.current += 1;
    const myGeneration = generation.current;
    // 계정이 바뀌면 이전 계정의 값을 즉시 버린다 — 남겨 두면 남의 기록이 보인다.
    lastGood.current = null;
    if (!enabled || !user) {
      setState(DISABLED);
      return;
    }
    setState({ enabled: true, values: null, display: null, computedAt: null });
    void load(user.uid, myGeneration);
  }, [user, load, enabled]);

  return state;
}
