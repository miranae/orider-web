/**
 * canonical 훈련 결정 훅 (#886 — 에픽 app#2237 의 L).
 *
 * ## decisionRevision 이 캐시 키다
 *
 * 결정은 `decisionRevision`(= 입력 revision + 알고리즘 버전)이 같으면 같은 결정이다. 그래서
 * 응답의 revision 이 직전과 같으면 **state 를 갱신하지 않는다** — 같은 값으로 리렌더를 돌리면
 * 아래쪽 편집 중인 입력(목표 폼 등)이 서버 값으로 되감기는 사고가 난다.
 *
 * 마운트 시에는 캐시된 마지막 결정을 즉시 돌려준다. 빈 화면보다 낡은 값이 낫고, 낡음은
 * `display` 로 밝힌다(#884 의 canonicalDisplay 규칙).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { canonicalDisplayFor, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { fetchTrainingDecision } from "../services/trainingDecisionCanonicalClient";
import type {
  DecisionDiscipline,
  TrainingDecisionEnvelope,
} from "../services/trainingDecisionCanonicalContract";

/** uid+종목 별 마지막 결정. 페이지 이동으로 훅이 언마운트돼도 last-known-good 은 남는다. */
const decisionCache = new Map<string, TrainingDecisionEnvelope>();

function cacheKey(uid: string, discipline: DecisionDiscipline): string {
  return `${uid}:${discipline}`;
}

export function resetTrainingDecisionCacheForTests(): void {
  decisionCache.clear();
}

export function trainingDecisionCanonicalEnabled(): boolean {
  return getRuntimeConfig().trainingDecisionCanonicalEnabled === true;
}

export interface TrainingDecisionState {
  /** 전환이 꺼져 있거나 미로그인이면 null — 이때만 화면이 기존(로컬) 표시로 남는다. */
  envelope: TrainingDecisionEnvelope | null;
  display: CanonicalDisplay | null;
  /**
   * 서버가 이 화면을 껐다(`rolloutEnabled === false`). 화면은 **일시 중단**을 명시하고,
   * 로컬 밴드로 내려가지 않는다 — kill switch 를 내렸는데 로컬 판정이 대신 그려지면
   * 끈 의미가 없다 (#2442).
   */
  paused: boolean;
  loading: boolean;
  refresh: () => void;
}

export function useTrainingDecision(
  uid: string | null | undefined,
  discipline: DecisionDiscipline,
): TrainingDecisionState {
  const generation = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [envelope, setEnvelope] = useState<TrainingDecisionEnvelope | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const current = ++generation.current;
    if (!uid || !trainingDecisionCanonicalEnabled()) {
      setEnvelope(null);
      setLoading(false);
      return;
    }
    const cached = decisionCache.get(cacheKey(uid, discipline)) ?? null;
    setEnvelope(cached);
    setLoading(true);
    void fetchTrainingDecision(uid, discipline).then((next) => {
      if (generation.current !== current) return;
      setLoading(false);
      const previous = decisionCache.get(cacheKey(uid, discipline)) ?? null;
      // 같은 결정이면 아무것도 바꾸지 않는다 — 편집 중인 입력을 되감지 않기 위해서다.
      if (previous && sameDecision(previous, next)) return;
      // 값이 없는 응답은 last-known-good 을 덮어쓰지 않는다. 상태만 바꿔 낡음을 알린다.
      const merged = next.data === null && previous?.data
        // 전환 판정은 최신 응답의 것을 쓴다 — 낡은 판정으로 중단 상태를 덮으면 kill switch 가 늦게 듣는다.
        ? { ...previous, status: next.status, error: next.error, rolloutEnabled: next.rolloutEnabled }
        : next;
      decisionCache.set(cacheKey(uid, discipline), merged);
      setEnvelope(merged);
    });
    return () => {
      generation.current += 1;
    };
  }, [uid, discipline, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  return {
    envelope,
    display: envelope ? canonicalDisplayFor(envelope.status, envelope.data !== null) : null,
    paused: envelope?.rolloutEnabled === false,
    loading,
    refresh,
  };
}

function sameDecision(a: TrainingDecisionEnvelope, b: TrainingDecisionEnvelope): boolean {
  return a.status === b.status
    // 전환 판정이 뒤집혔으면 같은 결정이 아니다 — 아니면 kill switch 가 리렌더 억제에 먹힌다.
    && a.rolloutEnabled === b.rolloutEnabled
    && a.data !== null && b.data !== null
    && a.data.decisionRevision === b.data.decisionRevision;
}
