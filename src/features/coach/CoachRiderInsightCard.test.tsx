import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { User } from "firebase/auth";
import parity from "./__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../../services/coachRiderInsightContract";
import { CoachRiderInsightCard } from "./CoachRiderInsightCard";

const cardCss = readFileSync("src/features/coach/coach-rider-insight.css", "utf8");
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

  it("isolates unavailable failures and keeps narrow-screen/200% reflow rules", () => {
    mocks.state = { insight: null, loading: false, unavailable: true };
    render(<div><span>existing-fitness-pdc</span><CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} /></div>);
    expect(screen.getByText("existing-fitness-pdc")).toBeInTheDocument();
    expect(screen.getByText(/기존 피트니스 PDC 결과는 그대로/)).toBeInTheDocument();
    expect(cardCss).toContain("min-width: 0"); expect(cardCss).toContain("overflow-wrap: anywhere");
    expect(cardCss).toContain("flex-wrap: wrap"); expect(cardCss).toContain("@media (max-width: 32rem)");
    expect(cardCss).toMatch(/coach-rider-card__questions \{ grid-template-columns: 1fr;/);
  });

  it("renders the 200% equivalent 320 CSS px structure without fixed-width traps and preserves keyboard order", async () => {
    const selected = vi.fn();
    const { container } = render(<>
      <style>{cardCss}</style>
      <div data-testid="zoom-viewport" style={{ width: "320px", maxWidth: "100%", overflowX: "auto" }}>
        <CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={selected} />
      </div>
    </>);
    const viewport = screen.getByTestId("zoom-viewport");
    const card = container.querySelector<HTMLElement>(".coach-rider-card")!;
    const questions = container.querySelector<HTMLElement>(".coach-rider-card__questions")!;
    const buttons = screen.getAllByRole("button");

    expect(viewport).toHaveStyle({ width: "320px", maxWidth: "100%" });
    expect(getComputedStyle(card).minWidth).toMatch(/^0(?:px)?$/);
    expect(getComputedStyle(card).overflowWrap).toBe("anywhere");
    expect(questions).toContainElement(buttons[0]);
    expect(questions).toContainElement(buttons[1]);
    buttons[0].focus();
    await userEvent.tab();
    expect(buttons[1]).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(selected).toHaveBeenCalledWith({
      question: "어떤 지속시간 영역을 우선 훈련해야 해?",
      snapshotId: "rider_aaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });
});
