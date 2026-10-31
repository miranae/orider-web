import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { httpsCallable } from "firebase/functions";

import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { ensureAppCheckReady, functions } from "./firebase";

export interface AcceptBikeThresholdDecisionResponse {
  ok: true;
  applied: boolean;
  decisionId: string;
  ftp: number;
  ftpRevision: string;
  ftpGeneration?: number;
  mutationId: string;
  cacheSync: "async";
  bundleSync: "async";
}

export async function acceptBikeThresholdDecision(
  expectedUid: string,
  decision: BikeThresholdDecisionV2,
  services?: Pick<FirebaseServices, "functions" | "ensureAppCheckReady">,
): Promise<AcceptBikeThresholdDecisionResponse> {
  const client = services ?? { functions, ensureAppCheckReady };
  await client.ensureAppCheckReady();
  const callable = httpsCallable<unknown, AcceptBikeThresholdDecisionResponse>(
    client.functions,
    "acceptBikeThresholdDecision",
  );
  const response = await callable({
    expectedUid,
    decisionId: decision.decisionId,
    expectedFtpRevision: decision.expectedRevisions.ftp,
    expectedPdcRevision: decision.expectedRevisions.pdc,
    expectedImpactPreviewRevision: decision.expectedRevisions.impactPreview,
  });
  return response.data;
}
