import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CoachPrescriptionDTO } from "../../services/coachPrescriptionContract";
import type { CoachV2Response } from "../../services/coachV2Contract";
import fixture from "./__fixtures__/p2-web-fixture.json";
import { CoachAnswerDocumentView } from "./CoachAnswerDocument";

vi.mock("./CoachPrescription", async () => {
  const { useState } = await import("react");
  return { CoachPrescription: ({ initial, parentRequestId, onQuestionSelect }: {
    initial: CoachPrescriptionDTO;
    parentRequestId: string;
    onQuestionSelect?: (question: string, prescriptionId: string, sourceRequestId: string) => void;
  }) => {
    const [identity] = useState(() => ({ prescriptionId: initial.prescriptionId, sourceRequestId: parentRequestId }));
    return <section>
      <span>{`screen:${identity.prescriptionId}`}</span>
      <span>{`recovery:${identity.sourceRequestId}`}</span>
      <button type="button" onClick={() => onQuestionSelect?.("linked question", identity.prescriptionId,
        identity.sourceRequestId)}>linked question</button>
    </section>;
  } };
});

function response(requestId: string, prescriptionId: string): CoachV2Response {
  const prescription = { ...fixture, prescriptionId } as CoachPrescriptionDTO;
  return { apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1",
    requestId, outcome: "answer", answer: { compatibility: "supported", answerId: `answer_${requestId}`,
      sourceFactsId: "facts", questionSummary: "summary", status: "complete", evidence: [], warnings: [],
      freshness: { asOf: "2026-07-28T00:00:00.000Z", timezone: "Asia/Seoul", staleSourceSlotIds: [] },
      followUps: [], blocks: [{ kind: "prescription", blockId: "same-block", sourceSlotIds: [], partial: false,
        stale: false, truncated: false, omittedCount: 0, prescription }] },
    quota: { limit: 3, remaining: 2, resetAt: "2026-07-28T01:00:00.000Z", consumed: true },
    budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
    retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true,
      providerCallAllowed: false, retryable: false, reasonCode: "completed" },
    execution: { parser: "deterministic", queryPlanHash: "hash", catalogVersion: "catalog", factsId: "facts",
      asOf: "2026-07-28T00:00:00.000Z" } };
}

describe("CoachAnswerDocumentView prescription identity", () => {
  it("remounts a reused block for a new response request and uses only its new planner context", async () => {
    const firstRequestId = "018f47a2-3c4d-7abc-8def-000000000201";
    const secondRequestId = "018f47a2-3c4d-7abc-8def-000000000202";
    const firstPrescriptionId = `rx_${"1".repeat(24)}`;
    const secondPrescriptionId = `rx_${"2".repeat(24)}`;
    const onPlannerQuestion = vi.fn();
    const view = render(<CoachAnswerDocumentView response={response(firstRequestId, firstPrescriptionId)} locale="ko-KR"
      onAction={vi.fn()} onPlannerQuestion={onPlannerQuestion} />);

    expect(screen.getByText(`screen:${firstPrescriptionId}`)).toBeInTheDocument();
    expect(screen.getByText(`recovery:${firstRequestId}`)).toBeInTheDocument();

    view.rerender(<CoachAnswerDocumentView response={response(secondRequestId, secondPrescriptionId)} locale="ko-KR"
      onAction={vi.fn()} onPlannerQuestion={onPlannerQuestion} />);

    expect(screen.queryByText(`screen:${firstPrescriptionId}`)).not.toBeInTheDocument();
    expect(screen.queryByText(`recovery:${firstRequestId}`)).not.toBeInTheDocument();
    expect(screen.getByText(`screen:${secondPrescriptionId}`)).toBeInTheDocument();
    expect(screen.getByText(`recovery:${secondRequestId}`)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "linked question" }));
    expect(onPlannerQuestion).toHaveBeenCalledWith("linked question", secondPrescriptionId, secondRequestId);
  });
});
