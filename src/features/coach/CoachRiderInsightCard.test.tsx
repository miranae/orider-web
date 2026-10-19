import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import parity from "./__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../../services/coachRiderInsightContract";
import { CoachRiderInsightCard } from "./CoachRiderInsightCard";
const mocks = vi.hoisted(() => ({
  enabled: true,
  state: { insight: null as ReturnType<typeof parseCoachRiderInsight> | null, loading: false, unavailable: false },
}));
vi.mock("../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ coachRiderInsightEnabled: mocks.enabled }) }));
vi.mock("../../hooks/useCoachRiderInsight", () => ({ useCoachRiderInsight: () => mocks.state }));
const user = { uid: "owner" } as User;

function insight(status: "ok" | "low_confidence" | "missing_weight" | "insufficient_activity" = "ok") {
  const value = structuredClone(parity.cardEnvelope) as any;
  if (status !== "ok") { value.data.status = status; value.data.profile = null; }
  if (status === "low_confidence") value.data.reasonCodes = ["classification_low_confidence"];
  if (status === "missing_weight") { value.data.reasonCodes = ["weight_missing"]; value.data.weightKgSnapshot = null; value.data.ability = null; }
  if (status === "insufficient_activity") { value.data.reasonCodes = ["activity_count_below_5"]; value.data.activityCount = 4; }
  return parseCoachRiderInsight(value);
}

describe("CoachRiderInsightCard", () => {
  beforeEach(() => { mocks.enabled = true; mocks.state = { insight: insight(), loading: false, unavailable: false }; });

  it("stays absent under the dedicated default-off flag and for unsupported disciplines", () => {
    mocks.enabled = false;
    const off = render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(off.container).toBeEmptyDOMElement(); off.unmount(); mocks.enabled = true;
    const run = render(<CoachRiderInsightCard user={user} discipline="run" onQuestionSelect={vi.fn()} />);
    expect(run.container).toBeEmptyDOMElement();
  });

  it("leads with the canonical O·RIDER result and fills a snapshot-bound question without exposing provenance", () => {
    const selected = vi.fn(); render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={selected} />);
    expect(screen.getByRole("heading", { name: "Rider Insight" })).toBeInTheDocument();
    expect(screen.getByText("올라운더")).toBeInTheDocument();
    expect(screen.getByText("신뢰도 91%")).toBeInTheDocument();
    expect(screen.getByText("강점")).toBeInTheDocument(); expect(screen.getByText("보완")).toBeInTheDocument();
    expect(screen.queryByText(/pdcr_|rider_aaaaaaaa|activityId|Bryton/i)).not.toBeInTheDocument();
    const question = screen.getByRole("button", { name: "내 라이더 유형과 강점·보완점을 설명해줘." });
    fireEvent.click(question);
    expect(selected).toHaveBeenCalledWith({ question: "내 라이더 유형과 강점·보완점을 설명해줘.", snapshotId: "rider_aaaaaaaaaaaaaaaaaaaaaaaa" });
  });

  it.each(["low_confidence", "missing_weight", "insufficient_activity"] as const)("does not assert a type or enable questions for %s", (status) => {
    mocks.state = { insight: insight(status), loading: false, unavailable: false };
    render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(screen.queryByText("올라운더")).not.toBeInTheDocument();
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });

  it("isolates unavailable failures from existing fitness results", () => {
    mocks.state = { insight: null, loading: false, unavailable: true };
    render(<div><span>existing-fitness-pdc</span><CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} /></div>);
    expect(screen.getByText("existing-fitness-pdc")).toBeInTheDocument();
    expect(screen.getByText(/기존 피트니스 PDC 결과는 그대로/)).toBeInTheDocument();
  });
});
