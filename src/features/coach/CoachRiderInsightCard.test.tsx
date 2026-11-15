import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import parity from "./__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../../services/coachRiderInsightContract";
import { CoachRiderInsightCard } from "./CoachRiderInsightCard";
import { MemoryRouter } from "react-router-dom";

// 경고의 해결 링크(LocalizedLink)가 라우터 안에서 그려진다.
const render: typeof rtlRender = ((ui: Parameters<typeof rtlRender>[0], options?: Parameters<typeof rtlRender>[1]) => rtlRender(ui, { wrapper: MemoryRouter, ...options })) as typeof rtlRender;
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

  it("makes the 「체중 필요」 chip and its sentence open the weight field", () => {
    mocks.state = { insight: insight("missing_weight"), loading: false, unavailable: false };
    render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["체중 필요", "W/kg 계산에 필요한 체중이 없어 라이더 유형을 확정하지 않습니다."]);
    links.forEach((link) => expect(link).toHaveAttribute("href", expect.stringContaining("/settings/account?focus=weight")));
  });

  it("leaves other states as plain text", () => {
    mocks.state = { insight: insight("low_confidence"), loading: false, unavailable: false };
    render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("CoachRiderInsightCard — 기록 부족 문구", () => {
  it("「활동 부족」 칩·문구를 누르면 파워 기록을 들여오는 연결 화면으로 간다", () => {
    mocks.enabled = true;
    mocks.state = { insight: insight("insufficient_activity"), loading: false, unavailable: false };
    render(<CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={vi.fn()} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["활동 부족", "정본 활동이 4개입니다. 5개 이상 쌓일 때까지 라이더 유형을 확정하지 않습니다."]);
    links.forEach((link) => expect(link).toHaveAttribute("href", expect.stringContaining("/settings/connections")));
  });
});
