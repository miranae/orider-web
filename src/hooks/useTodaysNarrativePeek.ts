/**
 * 오늘의 운동 narrative 캐시 peek — LLM 호출 없이 당일 캐시 여부만 빠르게 확인.
 *
 * `getTodaysRecommendationNarrative { cacheOnly: true }` 를 1회 호출해
 * 당일·종목 prefix 쿼리로 cached narrative 가 있는지 판별.
 * hit → data 반환; miss → data=null + cacheMiss=true.
 *
 * 사용 목적: TodaysWorkoutCard 가 마운트될 때 이미 생성된 narrative 가 있으면
 * 즉시 표시하고, 없으면 "분석 받기" 버튼 노출로 전환. (LLM 자동 호출 방지)
 *
 * stale 판별: 현재 facts 를 그대로 전송 — 서버에서 저장된 facts 의 type/zone/tsb/ctl/atl
 * 등을 비교해 stale 여부를 반환. facts 가 null 이면 peek 보류 (stale 판별 불가).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { RecommendationFacts } from "../utils/todaysRecommendation";

export type PeekDiscipline = "bike" | "run" | "swim";

interface CFPeekResponse {
  hit: boolean;
  narrative?: string;
  source?: "cache";
  generatedAt?: number;
  /** true = 캐시 있지만 현재 facts 와 달라 재생성 권장. */
  stale?: boolean;
}

/** cacheOnly peek 요청 payload — 전체 facts 를 포함해 서버 stale 판별 활성화. */
interface CFPeekRequest {
  cacheOnly: true;
  facts: RecommendationFacts;
  /** 출력 언어 — 서버 언어별 슬롯 조회. */
  lang?: "ko" | "en";
}

interface PeekState {
  narrative: string | null;
  loading: boolean;
  /** true = 서버에 오늘 캐시 없음. */
  cacheMiss: boolean;
  /**
   * true = 캐시 hit 이지만 저장된 facts 가 현재 facts 와 달라 재생성 가능 상태.
   * false = 최신 상태 (재생성 불필요) 또는 아직 미확인.
   */
  stale: boolean;
}

// 세션 내 중복 peek 방지 (discipline 별)
const peekDone = new Map<string, PeekState>();

/**
 * @param discipline  운동 종목. null 이면 peek 보류.
 * @param enabled     입력 데이터 준비 완료 + 카드 표시 조건 시에만 true.
 * @param facts       현재 룰엔진 facts. null 이면 stale 판별 불가 → peek 보류.
 */
export function useTodaysNarrativePeek(
  discipline: PeekDiscipline | null,
  enabled: boolean,
  facts: RecommendationFacts | null,
): PeekState {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const lang: "ko" | "en" = i18n.language?.startsWith("en") ? "en" : "ko";
  const [state, setState] = useState<PeekState>({ narrative: null, loading: false, cacheMiss: false, stale: false });
  const calledRef = useRef<string | null>(null);

  useEffect(() => {
    // facts 가 null 이면 stale 판별 불가 — peek 보류 (enabled 여도 대기)
    if (!user || !discipline || !enabled || !facts) return;
    const key = `${user.uid}:${discipline}:${lang}`;

    // 세션 캐시 적중
    if (peekDone.has(key)) {
      setState(peekDone.get(key)!);
      return;
    }

    // 이미 in-flight
    if (calledRef.current === key) return;
    calledRef.current = key;

    // ⚠️ cancelled/cleanup 가드를 두지 않는다: deps 의 `facts` 가 매 렌더 새 객체라
    // (ruleFacts = recommendToday(...) 인라인) effect 가 매 렌더 cleanup+재실행되는데,
    // cancelled 를 setState 가드로 쓰면 발사한 fetch 의 .then 이 영구 스킵돼 peek 가
    // loading 에 고착된다(캐시 답변·버튼 모두 미표시). 세션 중복은 calledRef + peekDone 로
    // 충분히 막고, React 19 는 언마운트 후 setState 를 무해 무시한다.
    setState({ narrative: null, loading: true, cacheMiss: false, stale: false });

    const fn = httpsCallable<CFPeekRequest, CFPeekResponse>(
      functions,
      "getTodaysRecommendationNarrative",
    );

    // 전체 facts 를 전송 — 서버가 type/zone/tsb/ctl/atl 를 저장값과 비교해 stale 판별.
    fn({ cacheOnly: true, facts, lang })
      .then((res) => {
        const d = res.data;
        const next: PeekState = d.hit && d.narrative
          ? { narrative: d.narrative, loading: false, cacheMiss: false, stale: d.stale ?? false }
          : { narrative: null, loading: false, cacheMiss: true, stale: false };
        peekDone.set(key, next);
        setState(next);
      })
      .catch(() => {
        // peek 실패는 조용히 miss 처리하되 세션 캐시에 저장하지 않는다. 일시적 인증/네트워크
        // 오류를 miss 로 고정하면 서버 복구 후에도 같은 탭에서 AI 카드가 계속 비어 보인다.
        const next: PeekState = { narrative: null, loading: false, cacheMiss: true, stale: false };
        setState(next);
      })
      .finally(() => {
        if (calledRef.current === key) calledRef.current = null;
      });
  }, [user?.uid, discipline, enabled, facts, lang]);

  return state;
}

/** 오늘 날짜 기준 peek 세션 캐시 무효화. 새 narrative 생성 완료 후 호출.
 *  언어별 슬롯이 모두 갱신되도록 해당 uid:discipline 의 전 언어 키를 비운다. */
export function invalidateTodaysNarrativePeekCache(uid: string, discipline: PeekDiscipline): void {
  const prefix = `${uid}:${discipline}:`;
  for (const k of Array.from(peekDone.keys())) {
    if (k === `${uid}:${discipline}` || k.startsWith(prefix)) peekDone.delete(k);
  }
}
