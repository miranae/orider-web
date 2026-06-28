/**
 * 오늘의 권장 narrative — LLM (Gemini) 호출 + Firestore 캐시 활용 hook.
 *
 * 동작:
 *   1. 입력 deep equal 비교 → 동일 입력이면 재호출 안 함 (클라 측 in-flight 가드)
 *   2. CF 가 prompt 본문의 sha1 으로 캐시 키 결정 — 한 바이트라도 다르면 새 narrative 생성
 *   3. CF 실패 시 null 반환 — 호출자는 composer fallback 사용
 *
 * 설계 — facts/summary/athlete/goal/adaptation/disciplineMismatch 등 모든 입력을 그대로 CF 로
 * 보내고, 캐시 invalidation 결정은 서버가 prompt 자체 sha1 으로 자동 수행. 클라가 수동으로
 * factsHash 관리하던 옛 구조는 사람 손에 의존해 사고 빈발 → prompt-hash 기반으로 전환.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { RecommendationFacts } from "../utils/todaysRecommendation";
import { logClientError } from "../services/errorLogger";
import type { TrainingSummary } from "@shared/types/training-summary";

export interface AthleteProfile {
  ftpWatts?: number;
  weightKg?: number;
  heightCm?: number;
  maxHr?: number;
  lthr?: number;
  thresholdPaceSec?: number;
  cssSec?: number;
}

export interface GoalDetail {
  courseName?: string;
  daysUntil?: number;
  distanceKm?: number;
  elevationM?: number;
  targetDurationMin?: number;
  feasibility?: "easy" | "on_track" | "stretch" | "risky" | null;
}

export interface NarrativeAdaptation {
  recent4wPlannedSum: number;
  recent4wActualSum: number;
  ratio: number;
  severity: "info" | "warn" | "critical";
  streakWeeksOff?: number;
}

export interface NarrativeDisciplineMismatch {
  goalDisc7dTss: number;
  crossDisc7dTss: number;
}

interface CFResponse {
  narrative: string;
  source: "cache" | "generated";
  generatedAt: number;
}

/**
 * 사용자 가시 phase — 데이터 준비 → AI 분석 → 완성. silent debounce 대신 명시적
 * 상태 노출로 UX 투명화. (옛: 800ms 동안 아무 표시 없이 대기 → 사용자가 멍하니 봄.)
 */
export type NarrativePhase = "idle" | "preparing" | "calling" | "ready";

interface State {
  narrative: string | null;
  source: "cache" | "generated" | null;
  loading: boolean;
  phase: NarrativePhase;
  /** 마지막 fetch 의 입력 fingerprint — 같은 입력 재호출 회피. */
  lastFingerprint: string | null;
}

/**
 * 클라 측 in-flight 가드용 단순 fingerprint — 동일 입력 RPC 중복 회피만 목적.
 * 캐시 invalidation 의 실제 권위는 CF 의 prompt sha1. 여긴 그저 RPC 중복 제거.
 */
function localFingerprint(args: unknown): string {
  try {
    return JSON.stringify(args);
  } catch {
    return Math.random().toString();
  }
}

/**
 * @param facts — 룰 엔진 결과 (확정된 facts)
 * @param ready — 입력 데이터가 안정 상태인지. false 면 CF 호출 보류.
 */
export function useTodaysNarrative(
  facts: RecommendationFacts | null,
  ready: boolean = true,
  summary: TrainingSummary | null = null,
  athlete: AthleteProfile | null = null,
  goal: GoalDetail | null = null,
  adaptation: NarrativeAdaptation | null = null,
  disciplineMismatch: NarrativeDisciplineMismatch | null = null,
  lastActivityDaysAgo: number | null = null,
) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  // 출력 언어 — 서버의 언어별 narrative 슬롯을 조회·생성. en* → en, 그 외 → ko.
  const lang: "ko" | "en" = i18n.language?.startsWith("en") ? "en" : "ko";
  const [state, setState] = useState<State>({
    narrative: null,
    source: null,
    loading: false,
    phase: "idle",
    lastFingerprint: null,
  });
  const inFlightRef = useRef<string | null>(null);

  // 입력 전체를 deep-stringify 해서 fingerprint. RPC 중복 호출 차단용.
  // facts 의 chips/contextTags 같은 한국어 UI 라벨은 CF 에 전달은 되지만 prompt 에는 무시되도록
  // CF 가 처리. fingerprint 는 사람 손 의존 없이 자동 — 입력 한 바이트라도 다르면 재요청.
  const fingerprint = facts && ready
    ? localFingerprint({
        // sessionName/chips/contextTags 는 한국어 UI 전용 — fingerprint 에서도 빼서 RPC 중복 회피
        // 가 라벨 변경에 흔들리지 않도록. CF 의 캐시 키는 prompt sha1 기반이라 그쪽에서 자동 처리.
        f: {
          type: facts.type,
          workoutKind: (facts as { workoutKind?: string }).workoutKind ?? null,
          zone: facts.zone,
          durationMin: facts.durationMin,
          inputSnapshot: facts.inputSnapshot,
        },
        s: summary ? {
          computedAt: Math.floor(summary.computedAt / 86400000),
          week: summary.week,
          today: summary.today,
          month: summary.month,
        } : null,
        a: athlete,
        g: goal,
        ad: adaptation,
        dm: disciplineMismatch,
        ld: lastActivityDaysAgo,
        lng: lang,
      })
    : null;

  // phase 는 실제 LLM 호출이 시작될 때만 "preparing" 으로 진입한다 (아래 debounce effect).
  // 옛 구현은 ready=false 인 동안에도 eager 하게 "preparing" 을 켰는데, #393 에서 LLM 호출이
  // 사용자 명시 행동(triggerFull)으로 게이팅되면서 ready=false 가 "입력 로딩 중"이 아니라
  // "사용자가 아직 분석을 요청하지 않은 평상 상태"가 됐다. 그 결과 peek 캐시 답변을 보여주는
  // 정상 화면에서도 "오늘 상태 데이터 다시 계산 중…" indicator 가 영구히 떠 있었다.
  // → eager preparing 제거: 실제 호출(ready=true)이 일어날 때만 indicator 노출.

  // fingerprint 가 짧은 시간 안에 단계적으로 변하는 케이스 (summary/projection/
  // activeGoals onSnapshot 이 비동기로 차례 도착) 에서 매 변동마다 LLM 호출하면 한
  // 페이지 로드에 3~4회 paid call 발생. 마지막 변동 후 debounceMs 동안 추가 변동
  // 없으면 호출 — 안정 상태에서 1회로 수렴.
  const debounceMs = 800;
  useEffect(() => {
    if (!user || !facts || !ready || !fingerprint) return;
    if (state.lastFingerprint === fingerprint) return;
    if (inFlightRef.current === fingerprint) return;

    const facts1: RecommendationFacts = facts;
    const fp1: string = fingerprint;
    // 즉시 "preparing" phase 진입 — 사용자에게 "데이터 다시 계산 중" 명시.
    // 800ms 안에 입력이 또 변하면 cleanup 되고 새 effect 가 다시 preparing 진입.
    setState((s) => ({ ...s, phase: "preparing", loading: true }));
    const timer = setTimeout(() => { doFetch(); }, debounceMs);
    return () => clearTimeout(timer);

    function doFetch() {
    inFlightRef.current = fp1;
    setState((s) => ({ ...s, phase: "calling", loading: true }));

    const fn = httpsCallable<
      {
        facts: RecommendationFacts;
        /** Deprecated. 신규 CF 는 prompt sha1 로 캐시 결정. 라이브 CF (구버전 배포본) 가
         *  factsHash 를 필수로 요구하던 시기 호환용 — 배포 후엔 무시됨. fingerprint 그대로 전달. */
        factsHash: string;
        summary?: TrainingSummary | null;
        athlete?: AthleteProfile | null;
        goal?: GoalDetail | null;
        adaptation?: NarrativeAdaptation | null;
        disciplineMismatch?: NarrativeDisciplineMismatch | null;
        lastActivityDaysAgo?: number | null;
        lang?: "ko" | "en";
      },
      CFResponse
    >(functions, "getTodaysRecommendationNarrative");

    fn({
      facts: facts1,
      factsHash: fp1,
      summary: summary ?? undefined,
      athlete: athlete ?? undefined,
      goal: goal ?? undefined,
      adaptation: adaptation ?? undefined,
      disciplineMismatch: disciplineMismatch ?? undefined,
      lastActivityDaysAgo: lastActivityDaysAgo ?? undefined,
      lang,
    })
      .then((res) => {
        const data = res.data;
        setState({
          narrative: data.narrative,
          source: data.source,
          loading: false,
          phase: "ready",
          lastFingerprint: fp1,
        });
      })
      .catch((err) => {
        logClientError("useTodaysNarrative", err, { fingerprint: fp1 });
        setState({ narrative: null, source: null, loading: false, phase: "idle", lastFingerprint: null });
      })
      .finally(() => {
        if (inFlightRef.current === fp1) inFlightRef.current = null;
      });
    }
     
  }, [user?.uid, fingerprint, ready]);

  return state;
}
