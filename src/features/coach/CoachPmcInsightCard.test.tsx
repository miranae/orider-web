import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { readFileSync } from "node:fs";
import parity from "./__fixtures__/pmc-fitness-parity.json";
import { parseCoachPmcInsight } from "../../services/coachPmcInsightContract";
import { CoachPmcInsightCard } from "./CoachPmcInsightCard";

const cardCss = readFileSync("src/features/coach/coach-pmc-insight.css", "utf8");

const mocks = vi.hoisted(() => ({
  enabled: true,
  state: { insight: null as ReturnType<typeof parseCoachPmcInsight> | null, loading: false, unavailable: false },
}));
vi.mock("../../services/runtimeConfig", () => ({
  getRuntimeConfig: () => ({ coachPmcInsightEnabled: mocks.enabled }),
}));
vi.mock("../../hooks/useCoachPmcInsight", () => ({
  useCoachPmcInsight: () => mocks.state,
}));

const user = { uid: "owner" } as User;

function insight(status: "ok" | "partial" | "stale" | "missing" = "ok") {
  const value = structuredClone(parity.cardEnvelope) as any;
  if (status === "partial") {
    value.data.status = "partial"; value.data.classification = null;
    value.data.sourceQuality.level = "incomplete"; value.data.interpretationCode = "incomplete_data";
  } else if (status === "stale") {
    value.data.status = "stale"; value.data.classification = null; value.data.freshness.status = "stale";
    value.data.sourceQuality.level = "incomplete"; value.data.interpretationCode = "refresh_required";
  } else if (status === "missing") {
    value.data.status = "missing"; value.data.classification = null; value.data.freshness.status = "missing";
    value.data.sourceQuality.level = "unavailable"; value.data.interpretationCode = "data_unavailable";
    value.data.current = { ctl: null, atl: null, form: null }; value.data.delta7d = { ctl: null, atl: null, form: null };
  }
  return parseCoachPmcInsight(value);
}

describe("CoachPmcInsightCard", () => {
  beforeEach(() => {
    mocks.enabled = true; mocks.state = { insight: insight(), loading: false, unavailable: false };
  });

  it("stays absent under the dedicated default-off flag", () => {
    mocks.enabled = false;
    const { container } = render(<CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders semantic metrics, signed deltas and localized questions without exposing opaque revision codes", () => {
    const selected = vi.fn();
    render(<CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={selected} />);
    expect(screen.getByRole("heading", { name: "훈련 부하와 폼" })).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(screen.getByText("7일 변화 +2.5")).toBeInTheDocument();
    expect(screen.getByText("7일 변화 -5.5")).toBeInTheDocument();
    expect(screen.queryByText(/pmcr_/)).not.toBeInTheDocument();
    const question = screen.getByRole("button", { name: "최근 7일 동안 훈련 부하는 어떻게 달라졌어?" });
    fireEvent.click(question);
    expect(selected).toHaveBeenCalledWith({ question: "최근 7일 동안 훈련 부하는 어떻게 달라졌어?",
      snapshotId: "pmc_aaaaaaaaaaaaaaaaaaaaaaaa" });
  });

  it("gives each rendered card region a unique accessible heading id", () => {
    render(<><CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />
      <CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} /></>);
    const regions = screen.getAllByRole("region", { name: "훈련 부하와 폼" });
    expect(regions).toHaveLength(2);
    expect(regions[0]?.getAttribute("aria-labelledby")).not.toBe(regions[1]?.getAttribute("aria-labelledby"));
  });

  it("keeps the card reflow-safe for narrow screens and 200% zoom", () => {
    expect(cardCss).toContain("min-width: 0");
    expect(cardCss).toContain("overflow-wrap: anywhere");
    expect(cardCss).toContain("flex-wrap: wrap");
    expect(cardCss).toContain("@media (max-width: 32rem)");
    expect(cardCss).toMatch(/\.coach-pmc-card__metrics,\s*\.coach-pmc-card__questions\s*{\s*grid-template-columns: 1fr;/);
    expect(cardCss).toContain("margin-block-end: var(--space-3)");
  });

  it("allows snapshot-bound questions for partial data without showing a definitive interpretation", () => {
    mocks.state = { insight: insight("partial"), loading: false, unavailable: false };
    render(<CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "최근 7일 동안 훈련 부하는 어떻게 달라졌어?" })).toBeEnabled();
    expect(screen.getByText(/확정적인 해석은 제공하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText("최근 부하가 높은 범위로 분류되었습니다.")).not.toBeInTheDocument();
  });

  it.each(["stale", "missing"] as const)("disables every question for %s data", (status) => {
    mocks.state = { insight: insight(status), loading: false, unavailable: false };
    render(<CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });

  it("keeps unavailable card failures isolated from the surrounding Fitness and Coach entry UI", () => {
    mocks.state = { insight: null, loading: false, unavailable: true };
    render(<div><span>existing-fitness</span><CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} /></div>);
    expect(screen.getByText("existing-fitness")).toBeInTheDocument();
    expect(screen.getByText(/기존 피트니스 화면은 그대로 이용/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
