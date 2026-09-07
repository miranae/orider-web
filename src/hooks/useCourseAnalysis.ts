/**
 * 코스 분석 정본 훅 (#887).
 *
 * 전환이 꺼져 있거나 코스 id 가 없으면 아무것도 읽지 않고 `envelope: null` 을 준다 —
 * 그때 화면은 오늘과 똑같이 코스 문서 값을 그린다.
 */
import { useEffect, useState } from "react";

import { canonicalDisplayFor, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { canonicalConsumerEnabled } from "../config/canonicalConsumers";
import { fetchCourseAnalysis, type CourseAnalysisEnvelope } from "../services/courseAnalysisReader";

export interface CourseAnalysisState {
  envelope: CourseAnalysisEnvelope | null;
  display: CanonicalDisplay | null;
}

/** 화면 상태 → 안내 문구 키(`course:analysis.*`). 값이 보이는 상태면 안내가 없다. */
export function courseAnalysisNoteKey(display: CanonicalDisplay | null): string | null {
  switch (display) {
    case "value_with_stale_hint": return "analysis.stale";
    case "loading": return "analysis.processing";
    case "error": return "analysis.error";
    case "empty": return "analysis.empty";
    default: return null;
  }
}

export function useCourseAnalysis(courseId: string | null | undefined): CourseAnalysisState {
  const [envelope, setEnvelope] = useState<CourseAnalysisEnvelope | null>(null);

  useEffect(() => {
    if (!courseId || !canonicalConsumerEnabled("course")) {
      setEnvelope(null);
      return;
    }
    let active = true;
    void fetchCourseAnalysis(courseId).then((next) => {
      if (active) setEnvelope(next);
    });
    return () => { active = false; };
  }, [courseId]);

  return {
    envelope,
    display: envelope ? canonicalDisplayFor(envelope.status, envelope.data !== null) : null,
  };
}
