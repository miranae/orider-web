import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../services/firebase";
import { track, trackActivationStep } from "../services/analytics";
import type { CreateSegmentProposalRequest } from "@shared/types";

export function useSegmentCreator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProposal = useCallback(async (
    data: CreateSegmentProposalRequest,
  ): Promise<{ segmentId: string } | null> => {
    setLoading(true);
    setError(null);
    // funnel 분모는 "시도"이므로 await 이전에 발사 (실패 시에도 시도는 시도)
    track("segment_create_submit", { category: data.category });
    try {
      const fn = httpsCallable<CreateSegmentProposalRequest, { segmentId: string }>(
        functions,
        "createSegmentProposal",
      );
      const result = await fn(data);
      track("segment_create_ok", { segment_id: result.data.segmentId });
      trackActivationStep(auth.currentUser?.uid ?? null, "first_segment_create", {
        segment_id: result.data.segmentId,
        category: data.category,
      });
      return result.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "세그먼트 생성에 실패했습니다";
      setError(msg);
      track("segment_create_fail", { err: msg });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createProposal, loading, error };
}
