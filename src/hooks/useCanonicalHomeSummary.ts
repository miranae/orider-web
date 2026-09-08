/**
 * 홈 요약 canonical consumer 훅 (#884 — 에픽 app#2237 의 I).
 *
 * 화면은 이 훅이 돌려주는 `display` 로 분기한다. **`totals` 가 null 이면 숫자를 그리지
 * 않는다** — 0 으로 채우면 "미계산" 과 "실제로 0km" 가 같은 화면이 되고, 그게 이 에픽이
 * 없애려는 결함이다.
 *
 * 마지막으로 성공한 값을 들고 있다가(last-known-good) 실패·계산중에 활용한다.
 *
 * ## 켜지는 조건은 둘 다다
 *
 * **빌드 플래그(`canonicalConsumersEnabled`) AND 서버 전환 판정(`homeSummary`)** 이다.
 * 로컬 스위치가 언제나 이긴다(배포 되돌리기 없이 끌 수 있는 마지막 수단). 판정을 기다리는
 * 동안은 켜짐도 꺼짐도 아니므로 아무것도 부르지 않는다 — 판정 전에 요청부터 나가면 서버가
 * 뒤늦게 "끄라" 고 답해도 소용이 없다 (#2237 리뷰).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logClientError } from "../services/errorLogger";
import {
  canonicalConsumersEnabled,
  fetchCanonicalHomeSummary,
  type CanonicalHomeSummaryData,
  type CanonicalHomeTotals,
} from "../services/canonicalApi";
import { decideCanonicalRender, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

export interface CanonicalHomeSummaryState {
  /**
   * 이 화면이 정본으로 갈아탔는가. false 면 화면은 **오늘과 똑같이** 클라 집계를 그린다 —
   * `display` 로 분기하지 않는다.
   */
  enabled: boolean;
  /** null 이면 **숫자를 그리지 않는다.** */
  totals: CanonicalHomeTotals | null;
  display: CanonicalDisplay | null;
  /** 진단용 — 어느 계산본인지. */
  computedAt: number | null;
}

const DISABLED: CanonicalHomeSummaryState = {
  enabled: false, totals: null, display: null, computedAt: null,
};

export function useCanonicalHomeSummary(): CanonicalHomeSummaryState {
  const { user } = useAuth();
  const rollout = useCanonicalRollout();
  // 빌드 플래그 AND 서버 판정. 판정을 기다리는 동안 canonicalRolloutAllows 는 꺼짐으로 답한다.
  const enabled = canonicalConsumersEnabled() && canonicalRolloutAllows(rollout, "homeSummary");
  const [state, setState] = useState<CanonicalHomeSummaryState>(DISABLED);
  const lastGood = useRef<CanonicalHomeTotals | null>(null);
  // 늦게 도착한 응답이 최신을 덮지 않게 한다. uid 비교만으로는 같은 계정의 중복
  // 요청과 A→B→A 전환을 걸러내지 못한다.
  const generation = useRef(0);

  const load = useCallback(async (uid: string, myGeneration: number) => {
    const envelope = await fetchCanonicalHomeSummary();
    if (generation.current !== myGeneration) return;
    const data = envelope.data as CanonicalHomeSummaryData | null;
    const decision = decideCanonicalRender(envelope, lastGood.current !== null);
    if (decision.contractViolations.length > 0) {
      logClientError("useCanonicalHomeSummary.contract", new Error(decision.contractViolations.join("; ")), { uid });
    }
    const fresh = data?.rolling7d?.totals ?? null;
    if (fresh !== null && decision.display === "value") lastGood.current = fresh;
    setState({
      enabled: true,
      totals: fresh ?? (decision.display === "value_with_stale_hint" ? lastGood.current : null),
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
    // 켜져 있는데 아직 값이 없는 동안은 "꺼짐" 이 아니라 "계산 전" 이다 — 화면이 그 사이
    // 클라 집계로 돌아갔다가 서버 값으로 튀지 않게 한다.
    setState({ enabled: true, totals: null, display: null, computedAt: null });
    void load(user.uid, myGeneration);
  }, [user, load, enabled]);

  return state;
}
