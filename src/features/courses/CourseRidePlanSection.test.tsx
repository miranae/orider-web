import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachClientError, getCoachRidePlanAiContext, loadCoachRidePlan } from "../../services/coachClient";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { CourseRidePlanSection, formatRidePlanDuration } from "./CourseRidePlanSection";

const launcher = vi.hoisted(() => vi.fn(() => null));
vi.mock("../../services/coachClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../services/coachClient")>(),
  loadCoachRidePlan: vi.fn(), getCoachRidePlanAiContext: vi.fn(),
}));
vi.mock("../coach/CoachQuestionLauncher", () => ({
  CoachQuestionLauncher: (props: unknown) => { launcher(props); return null; },
}));

const load = vi.mocked(loadCoachRidePlan);
const loadAiContext = vi.mocked(getCoachRidePlanAiContext);
const contextToken = `ride2.${"a".repeat(100)}.${"b".repeat(43)}` as const;
const inputRevision = `ridein_${"c".repeat(24)}`;
const plan = {
  schemaVersion: "coach-ride-plan-v1" as const, status: "ok" as const, contextToken, inputRevision,
  course: { distanceM: 5_000, elevationGainM: 200 },
  estimate: { totalTimeSec: 3_660, averageSpeedKph: 18.5 },
  segments: [{ index: 0, startDistanceM: 0, endDistanceM: 5_000, averageGradePct: 4,
    estimatedSpeedKph: 18.5, estimatedTimeSec: 973 }],
  assumptions: { model: "cp-wprime-whole-course-v1" as const, weather: "not_modeled" as const,
    stops: "not_modeled" as const, fueling: "not_generated" as const, optimalSegmentPower: "not_generated" as const },
  exampleQuestionCodes: ["HARDEST_SECTION", "PERSONAL_PACING"] as const,
  execution: { providerCalls: 0 as const, quotaConsumed: false as const, writes: 0 as const },
};
const user = { uid: "owner" } as never;

function renderSection(isOwner = true) {
  return render(<CourseRidePlanSection courseId="private-course" isOwner={isOwner} user={user} onSignIn={vi.fn()} />);
}

describe("CourseRidePlanSection", () => {
  beforeEach(() => {
    load.mockReset(); launcher.mockClear(); load.mockResolvedValue(plan);
    loadAiContext.mockReset(); loadAiContext.mockResolvedValue({ schemaVersion: plan.schemaVersion, inputRevision,
      questionCode: "HARDEST_SECTION", course: plan.course, estimate: plan.estimate,
      segments: plan.segments, assumptions: plan.assumptions });
    resetRuntimeConfigForTests({ coachRidePlanTokenEnabled: true, coachRidePlanSnapshotEnabled: true,
      coachRidePlanAiEnabled: true, coachRidePlanRespondV2Enabled: true });
  });

  it.each([
    [3_599, "1시간"],
    [7_199, "2시간"],
  ] as const)("rounds %i seconds before splitting hours and minutes", (seconds, expected) => {
    expect(formatRidePlanDuration(seconds, "ko")).toBe(expected);
  });

  it("renders only server ETA, speed, segments and bounded assumptions", async () => {
    const { container } = renderSection();
    expect(await screen.findByText("1시간 1분")).toBeInTheDocument();
    expect(screen.getAllByText("18.5 km/h")).toHaveLength(2);
    expect(screen.getByText("0.0–5.0 km")).toBeInTheDocument();
    expect(screen.getByText(/날씨와 정차는 반영하지 않으며/u)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("private-course");
    expect(container.innerHTML).not.toContain(contextToken);
  });

  it("fills the composer selection with the exact token, revision and fixed code without auto-submit", async () => {
    renderSection();
    await userEvent.setup().click(await screen.findByRole("button", { name: "이 코스에서 가장 힘든 구간은 어디인가요?" }));
    await vi.waitFor(() => expect(loadAiContext).toHaveBeenCalledWith(
      "private-course", contextToken, "HARDEST_SECTION", expect.any(AbortSignal),
    ));
    expect(launcher).toHaveBeenLastCalledWith(expect.objectContaining({ ridePlanSelection: expect.objectContaining({
      question: "이 코스에서 가장 힘든 구간은 어디인가요?",
      context: { contextToken, inputRevision, questionCode: "HARDEST_SECTION" },
    }) }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("exposes semantic summary and keyboard-operable question controls", async () => {
    const { container } = renderSection();
    await screen.findByRole("heading", { name: "내 Ride Plan" });
    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelector("ol")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "제 능력에 맞춰 어떻게 나눠 타면 될까요?" });
    loadAiContext.mockResolvedValue({ schemaVersion: plan.schemaVersion, inputRevision,
      questionCode: "PERSONAL_PACING", course: plan.course, estimate: plan.estimate,
      segments: plan.segments, assumptions: plan.assumptions });
    button.focus(); await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(launcher).toHaveBeenLastCalledWith(expect.objectContaining({
      ridePlanSelection: expect.objectContaining({ context: expect.objectContaining({ questionCode: "PERSONAL_PACING" }) }),
    })));
  });

  it("fails closed when the AI projection drifts from the visible card", async () => {
    loadAiContext.mockResolvedValue({ schemaVersion: plan.schemaVersion, inputRevision,
      questionCode: "HARDEST_SECTION", course: plan.course,
      estimate: { ...plan.estimate!, totalTimeSec: plan.estimate!.totalTimeSec + 1 },
      segments: plan.segments, assumptions: plan.assumptions });
    renderSection();
    await userEvent.setup().click(await screen.findByRole("button", { name: "이 코스에서 가장 힘든 구간은 어디인가요?" }));
    expect(await screen.findByText(/질문 컨텍스트가 카드와 일치하지 않아/u)).toBeInTheDocument();
    expect(launcher).toHaveBeenLastCalledWith(expect.objectContaining({ ridePlanSelection: null }));
  });

  it("ignores a deferred route A projection after route B replaces its plan", async () => {
    let resolveRouteA: ((value: Awaited<ReturnType<typeof getCoachRidePlanAiContext>>) => void) | undefined;
    const routeAProjection = new Promise<Awaited<ReturnType<typeof getCoachRidePlanAiContext>>>((resolve) => {
      resolveRouteA = resolve;
    });
    const routeBToken = `ride2.${"d".repeat(100)}.${"e".repeat(43)}` as const;
    const routeBRevision = `ridein_${"f".repeat(24)}`;
    const routeBPlan = { ...plan, contextToken: routeBToken, inputRevision: routeBRevision };
    load.mockImplementation(async (courseId) => courseId === "route-a" ? plan : routeBPlan);
    loadAiContext.mockReturnValueOnce(routeAProjection);

    const view = render(<CourseRidePlanSection courseId="route-a" isOwner user={user} onSignIn={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "이 코스에서 가장 힘든 구간은 어디인가요?" }));
    const routeASignal = loadAiContext.mock.calls[0]?.[3];
    view.rerender(<CourseRidePlanSection courseId="route-b" isOwner user={user} onSignIn={vi.fn()} />);
    await screen.findByText("1시간 1분");
    expect(routeASignal?.aborted).toBe(true);

    resolveRouteA?.({ schemaVersion: plan.schemaVersion, inputRevision, questionCode: "HARDEST_SECTION",
      course: plan.course, estimate: plan.estimate, segments: plan.segments, assumptions: plan.assumptions });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith("route-b"));
    expect(launcher.mock.calls.some(([props]) => (props as { ridePlanSelection?: unknown }).ridePlanSelection != null)).toBe(false);
    expect(launcher).toHaveBeenLastCalledWith(expect.objectContaining({ ridePlanSelection: null }));
  });

  it.each([
    ["missing_pdc", "측정 파워 기반 PDC가 필요합니다"],
    ["missing_weight", "체중 snapshot이 없습니다"],
  ] as const)("renders the bounded %s state without questions", async (status, message) => {
    load.mockResolvedValue({ ...plan, status, estimate: null, segments: [] });
    renderSection();
    expect(await screen.findByText(new RegExp(message, "u"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /힘든 구간/u })).not.toBeInTheDocument();
  });

  it("maps stale token and missing elevation to bounded recovery states", async () => {
    load.mockRejectedValueOnce(new CoachClientError("http", "aborted")).mockResolvedValueOnce(plan);
    renderSection();
    await userEvent.setup().click(await screen.findByRole("button", { name: "새 계획 다시 불러오기" }));
    expect(await screen.findByText("1시간 1분")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(["deleted", "cross-owner"])("keeps %s failures indistinguishable and bounded", async () => {
    load.mockRejectedValue(new CoachClientError("http", "not-found"));
    const { container } = renderSection();
    expect(await screen.findByText("이 코스의 Ride Plan을 사용할 수 없습니다.")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("not-found");
  });

  it("maps missing elevation without exposing backend codes", async () => {
    load.mockRejectedValue(new CoachClientError("http", "failed-precondition"));
    const { container } = renderSection();
    expect(await screen.findByText(/고도 정보가 부족/u)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("failed-precondition");
  });

  it("keeps token and snapshot flags independently default-off and AI questions independently hidden", async () => {
    resetRuntimeConfigForTests({ coachRidePlanTokenEnabled: false, coachRidePlanSnapshotEnabled: true,
      coachRidePlanAiEnabled: true });
    const tokenOff = renderSection(); expect(tokenOff.container).toBeEmptyDOMElement(); tokenOff.unmount();
    resetRuntimeConfigForTests({ coachRidePlanTokenEnabled: true, coachRidePlanSnapshotEnabled: false,
      coachRidePlanAiEnabled: true });
    const snapshotOff = renderSection(); expect(snapshotOff.container).toBeEmptyDOMElement(); snapshotOff.unmount();
    expect(load).not.toHaveBeenCalled();

    resetRuntimeConfigForTests({ coachRidePlanTokenEnabled: true, coachRidePlanSnapshotEnabled: true,
      coachRidePlanAiEnabled: false });
    renderSection(); await screen.findByText("1시간 1분");
    expect(screen.queryByRole("button", { name: /힘든 구간/u })).not.toBeInTheDocument();
    expect(launcher).not.toHaveBeenCalled();

    resetRuntimeConfigForTests({ coachRidePlanTokenEnabled: true, coachRidePlanSnapshotEnabled: true,
      coachRidePlanAiEnabled: true, coachRidePlanRespondV2Enabled: false });
    const respondOff = renderSection(); await screen.findByText("1시간 1분");
    expect(screen.queryByRole("button", { name: /힘든 구간/u })).not.toBeInTheDocument();
    expect(launcher).not.toHaveBeenCalled(); respondOff.unmount();
  });

  it("does not request an owner-bound plan for signed-out or non-owner course views", () => {
    const nonOwner = renderSection(false); expect(nonOwner.container).toBeEmptyDOMElement(); nonOwner.unmount();
    const signedOut = render(<CourseRidePlanSection courseId="private-course" isOwner user={null} onSignIn={vi.fn()} />);
    expect(signedOut.container).toBeEmptyDOMElement(); expect(load).not.toHaveBeenCalled();
  });
});
