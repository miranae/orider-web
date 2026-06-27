/**
 * 활동 AI 분석 캐시 peek — LLM 호출 없이 캐시 여부만 빠르게 확인.
 *
 * `getActivityNarrative { cacheOnly: true }` 를 1회 호출해 Firestore 캐시 hit/miss 만 판별.
 * hit → data 반환 (ActivityNarrative); miss → data=null + cacheMiss=true.
 *
 * 사용 목적: 활동 상세를 열 때 이미 분석된 결과가 있으면 즉시 표시,
 * 없으면 "AI 분석하기" 버튼을 노출해 사용자가 명시적으로 생성을 요청하게 한다.
 * (자동 LLM 트리거 → 비용 최소화 + 의도치 않은 paid call 방지)
 *
 * 언어별 슬롯: lang(ko/en) 을 함께 넘겨 서버의 언어별 분석 슬롯을 조회한다. 세션 캐시 키도
 * `${activityId}:${lang}` 로 분리 — 언어 전환 시 다른 언어 결과가 잘못 노출되지 않는다.
 */
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import type { ActivityNarrative, NarrativeLang } from "./useActivityNarrative";

interface PeekState {
  data: ActivityNarrative | null;
  loading: boolean;
  /** true = 서버에 캐시 없음. false = 아직 로딩 중이거나 hit. */
  cacheMiss: boolean;
}

// 세션 캐시 — 탭 전환 시 peek 재요청 방지. 키 = `${activityId}:${lang}`.
const peekDone = new Map<string, ActivityNarrative | null>();
const peekKey = (activityId: string, lang: NarrativeLang) => `${activityId}:${lang}`;

/**
 * @param activityId  활동 id
 * @param enabled     스트림 준비 + 사이클 활동 등 호출 조건 충족 시에만 true
 * @param lang        출력 언어(ko/en). 서버 언어별 슬롯을 조회.
 */
export function useActivityNarrativePeek(activityId: string | null, enabled: boolean, lang: NarrativeLang = "ko"): PeekState {
  const [state, setState] = useState<PeekState>({ data: null, loading: false, cacheMiss: false });

  useEffect(() => {
    if (!enabled || !activityId) return;
    const key = peekKey(activityId, lang);

    // 세션 캐시 적중 → 즉시 반환
    if (peekDone.has(key)) {
      const cached = peekDone.get(key)!;
      setState({ data: cached, loading: false, cacheMiss: cached === null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, cacheMiss: false });

    const fn = httpsCallable<{ activityId: string; cacheOnly: true; lang: NarrativeLang }, { hit: boolean } & Partial<ActivityNarrative>>(
      functions,
      "getActivityNarrative",
    );

    fn({ activityId, cacheOnly: true, lang })
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        if (d.hit) {
          // hit: source 포함한 전체 payload 가 온다
          const narrative = d as unknown as ActivityNarrative;
          peekDone.set(key, narrative);
          setState({ data: narrative, loading: false, cacheMiss: false });
        } else {
          peekDone.set(key, null);
          setState({ data: null, loading: false, cacheMiss: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        // peek 실패는 조용히 miss 처리 (전체 분석은 사용자가 버튼으로 요청)
        setState({ data: null, loading: false, cacheMiss: true });
      });

    return () => { cancelled = true; };
  }, [activityId, enabled, lang]);

  return state;
}

/** 활동 peek 세션 캐시 무효화 — 분석 완료 후 AiRideAnalysisCard 가 호출해 갱신 유도.
 *  lang 미지정 시 해당 활동의 모든 언어 슬롯을 비운다. */
export function invalidateActivityNarrativePeekCache(activityId: string, lang?: NarrativeLang): void {
  if (lang) {
    peekDone.delete(peekKey(activityId, lang));
    return;
  }
  for (const k of Array.from(peekDone.keys())) {
    if (k.startsWith(`${activityId}:`)) peekDone.delete(k);
  }
}
