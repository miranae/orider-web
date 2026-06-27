/**
 * 활동 구간 내러티브 (AI 라이딩 분석) — onCall 호출 + 캐시 활용 hook.
 *
 * 서버(getActivityNarrative)가 스트림 분할·refiner·Haiku·캐시를 모두 수행하므로,
 * 클라는 activityId 만 넘기고 결과를 받는다. 같은 facts+버전이면 서버가 캐시 반환(LLM skip).
 * 활동 열람 시 lazy 호출 — 조회한 활동만 과금.
 *
 * 설계: docs/architecture/RIDE_SEGMENT_NARRATIVE.md
 */
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export type RelWind = "head" | "tail" | "cross";
export type Terrain = "climb" | "descent" | "flat";
/** 분석 출력 언어. 서버 슬롯 키와 일치(`analysis`=ko / `analysis_en`). */
export type NarrativeLang = "ko" | "en";

export interface NarrativeSegment {
  fromKm: number;
  toKm: number;
  terrain: Terrain;
  avgGradePct: number;
  elevGainM: number;
  avgSpeedKmh: number;
  avgPowerW: number;
  avgHr: number;
  zone: string | null;
  pctHrMax: number | null;
  hrDrift: number;
  avgCadence: number;
  avgTempC: number | null;
  relWind: RelWind;
  movingSec: number;
  pauseSec: number;
  boundaryDriver: string;
  flags: string[];
  efforts: {
    name: string;
    komRank: number | null;
    prRank: number | null;
    attemptNo?: number | null;
    totalAttempts?: number | null;
    personalBestSec?: number | null;
    deltaVsBestSec?: number | null;
    isPR?: boolean;
    trend?: "improving" | "stable" | "declining" | null;
  }[];
  narrative: string;
}

export type PrescriptionHorizon = "ride" | "week";

/** 결정적 처방 — 서버 prescriber 산출(LLM 미경유). 구버전 캐시엔 없을 수 있어 옵셔널. */
export interface Prescription {
  horizon: PrescriptionHorizon;
  theme: string;
  title: string;
  detail: string;
}

export interface ActivityNarrative {
  narrativeVersion: string;
  generatedAt: number;
  isVirtualPower: boolean;
  summary: string;
  /** 코치 처방 (rsn-v10+). 구버전 캐시는 미포함 → 옵셔널. */
  prescriptions?: Prescription[];
  overall: {
    totalDistanceKm: number;
    movingSec: number;
    pauseSec: number;
    elevGainM: number;
    tempStartC: number | null;
    tempEndC: number | null;
    tempSource: "device" | "api" | null;
    flags: string[];
  };
  segments: NarrativeSegment[];
  source: "cache" | "generated";
  /** 생성 언어(서버 슬롯). 구버전 캐시엔 없을 수 있어 옵셔널. */
  lang?: NarrativeLang;
}

interface State {
  data: ActivityNarrative | null;
  loading: boolean;
  error: string | null;
}

// 모듈 레벨 세션 캐시 — 탭 전환(카드 언마운트/재마운트)·StrictMode 이중 실행에도 활동당
// onCall 을 1번만 보낸다. inflight: 진행 중 promise 공유, done: 완료 데이터 즉시 표시.
// (서버도 영구 캐시지만, 첫 생성 ~18s 동안 재마운트되면 클라가 중복 호출 → LLM 중복 생성.
//  이 캐시가 그 창을 막아 비용·로딩 반복을 차단한다.)
// 캐시 키는 `${activityId}:${lang}` — 언어별 슬롯을 분리해 ko/en 결과가 섞이지 않게 한다.
const inflight = new Map<string, Promise<ActivityNarrative>>();
const done = new Map<string, ActivityNarrative>();

/**
 * @param activityId 활동 id
 * @param enabled    스트림 준비 + 사이클 활동 등 호출 조건 충족 시에만 true
 * @param lang       출력 언어(ko/en). 서버 언어별 슬롯에 캐시·조회.
 */
export function useActivityNarrative(activityId: string | null, enabled: boolean, lang: NarrativeLang = "ko"): State {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!enabled || !activityId) return;
    const key = `${activityId}:${lang}`;

    // 완료 캐시 적중 → 즉시 표시(로딩·호출 없음)
    const cached = done.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    let promise = inflight.get(key);
    if (!promise) {
      const fn = httpsCallable<{ activityId: string; lang: NarrativeLang }, ActivityNarrative>(functions, "getActivityNarrative");
      promise = fn({ activityId, lang }).then((res) => res.data);
      inflight.set(key, promise);
      // 성공 → done 으로 승격, 실패 → inflight 비워 후속 마운트가 재시도 가능
      promise
        .then((data) => { done.set(key, data); })
        .catch((err) => logClientError("useActivityNarrative.bg", err, {}))
        .finally(() => { inflight.delete(key); });
    }

    promise
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        logClientError("useActivityNarrative", msg, { activityId, lang });
        setState({ data: null, loading: false, error: msg });
      });

    return () => { cancelled = true; };
  }, [activityId, enabled, lang]);

  return state;
}
