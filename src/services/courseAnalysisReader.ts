/**
 * 코스 분석 정본 reader (#887 — 에픽 app#2237 의 stage 4).
 *
 * 서버 원본은 `orider-g1-web/shared/types/course-analysis.ts` + `functions/src/course-analysis.ts`,
 * 문서는 `courses/{courseId}/analysis/current` 다.
 *
 * 웹은 코스 상세에서 **저장된 코스 문서의 `elevationGain` 을 그대로** 그려 왔다. 그 값은
 * 업로드 시점 파서가 모든 양의 고도 변화를 더한 것이라 GPS 잡음(±3~5 m)이 수백 m 로 누적된다.
 * 정본은 임계 스무딩을 거친 `elevationGainM` 이고, 난이도도 같은 값에서 나온다.
 *
 * 사용자가 그리는 중인(아직 저장 안 된) 경로는 여기 대상이 아니다 — 그건 `courseEngine/stats.ts`
 * 의 클라이언트 계산이 계속 맡는다(서버에 아직 문서가 없으므로).
 *
 * 이 함수는 **던지지 않는다.** 실패는 봉투 상태로 내려간다.
 */
import { doc, getDoc } from "firebase/firestore";

import {
  CANONICAL_SCHEMA_VERSION, CANONICAL_STATUSES,
  type CanonicalEnvelope, type CanonicalStatus,
} from "@shared/types/canonical";
import { firestore } from "./firebase";
import { debugLog, logClientError } from "./errorLogger";
import { knownEnumValue } from "./trainingDecisionCanonicalContract";

export const COURSE_DIFFICULTY_BANDS = ["easy", "moderate", "challenging", "hard", "expert"] as const;
export type CourseDifficultyBand = (typeof COURSE_DIFFICULTY_BANDS)[number];

export interface CourseAnalysis {
  /** 트랙 좌표(+고도) digest. 코스 문서가 바뀌었는데 이 값이 그대로면 분석이 낡은 것이다. */
  routeDigest: string;
  distanceM: number;
  /** 임계 스무딩 후 획득고도. 코스 문서의 raw `elevationGain` 과 다를 수 있다 — 이쪽이 정본. */
  elevationGainM: number;
  elevationLossM: number;
  difficulty: number;
  difficultyBand: CourseDifficultyBand | null;
}

export type CourseAnalysisEnvelope = CanonicalEnvelope<CourseAnalysis>;

function emptyEnvelope(status: CanonicalStatus, code?: string): CourseAnalysisEnvelope {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    algorithmVersion: "client_read",
    status,
    computedAt: null,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: null,
    error: status === "failed" ? { code: code ?? "read_failed", retryable: true } : null,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 문서 하나를 읽어 봉투로 만든다. 문서가 없으면 0 이 아니라 `unavailable` 이다. */
export async function fetchCourseAnalysis(courseId: string): Promise<CourseAnalysisEnvelope> {
  if (!courseId) return emptyEnvelope("unavailable");
  let raw: Record<string, unknown> | null;
  try {
    const snap = await getDoc(doc(firestore, "courses", courseId, "analysis", "current"));
    raw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch (error) {
    logClientError("fetchCourseAnalysis", error, { courseId });
    return emptyEnvelope("failed", "read_failed");
  }
  if (!raw) return emptyEnvelope("unavailable");

  const status = knownEnumValue(CANONICAL_STATUSES, typeof raw.status === "string" ? raw.status : null);
  const source = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const inputs = (source.inputs && typeof source.inputs === "object" ? source.inputs : {}) as Record<string, unknown>;
  const distanceM = num(source.distanceM);
  const elevationGainM = num(source.elevationGainM);

  // 값이 없으면 상태만 옮긴다. 0 으로 채우지 않는다.
  if (distanceM === null || elevationGainM === null) {
    const envelope = emptyEnvelope(status && status !== "canonical" && status !== "stale" ? status : "processing");
    debugLog("courseAnalysis.read", { courseId, status: envelope.status, hasValue: false });
    return envelope;
  }

  const envelope: CourseAnalysisEnvelope = {
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : CANONICAL_SCHEMA_VERSION,
    algorithmVersion: typeof raw.algorithmVersion === "string" ? raw.algorithmVersion : "course-analysis@1",
    status: status ?? "canonical",
    computedAt: num(raw.computedAt),
    inputRevision: typeof raw.inputRevision === "string" ? raw.inputRevision : null,
    inputDigest: typeof raw.inputDigest === "string" ? raw.inputDigest : null,
    period: null,
    data: {
      routeDigest: typeof inputs.routeDigest === "string" ? inputs.routeDigest : "",
      distanceM,
      elevationGainM,
      elevationLossM: num(source.elevationLossM) ?? 0,
      difficulty: num(source.difficulty) ?? 0,
      difficultyBand: knownEnumValue(
        COURSE_DIFFICULTY_BANDS,
        typeof source.difficultyBand === "string" ? source.difficultyBand : null,
      ),
    },
    error: null,
  };
  debugLog("courseAnalysis.read", {
    courseId, status: envelope.status, routeDigest: envelope.data?.routeDigest ?? null,
    elevationGainM: envelope.data?.elevationGainM ?? null,
  });
  return envelope;
}
