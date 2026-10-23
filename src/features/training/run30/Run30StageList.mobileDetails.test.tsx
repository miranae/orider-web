import { useEffect } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { fakeRun30Api, run30Program, run30Sessions } from "../../../__tests__/fixtures/run30";
import Run30ProgramView from "./Run30ProgramView";
import type { Run30StartMode } from "./run30Start";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("../../../hooks/useMobile", () => ({ useMobile: () => viewport.mobile }));
const TODAY = "2026-09-30";

function programFixture(finished = false) {
  const sessions = run30Sessions(TODAY, finished ? { 1: "completed", 2: "completed", 3: "completed" } : { 1: "completed" }).slice(0, 3);
  return run30Program({ sessions, nextStage: 2, totalStages: 3, remainingStages: finished ? 0 : 2, ...(finished ? { next: null } : {}) });
}
function RouteProbe({ onNavigate }: { onNavigate?: (navigate: NavigateFunction) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Expose the router's history driver for browser Back/Forward simulation.
  useEffect(() => { onNavigate?.(navigate); }, [onNavigate, navigate]);
  return <output data-testid="run30-route">{location.pathname}{location.search}{location.hash}</output>;
}
function renderProgram({ mode = { kind: "web" }, route = "/ko/coach/plan?sport=run", finished = false, onNavigate }: {
  mode?: Run30StartMode;
  route?: string;
  finished?: boolean;
  onNavigate?: (navigate: NavigateFunction) => void;
} = {}) {
  const api = fakeRun30Api();
  const program = programFixture(finished);
  const refresh = vi.fn().mockResolvedValue(undefined);
  const view = renderWithProviders(<><RouteProbe onNavigate={onNavigate} /><Run30ProgramView api={api} program={program} onRefresh={refresh} startMode={mode} today={TODAY} /></>, { route });
  return { ...view, api, program, refresh };
}
const baseStages = () => screen.getByTestId("K4-R-8");
const stageEntry = (stage: number) => within(baseStages()).getByRole("button", { name: `${stage}단계 · 구간 2개 보기 →` });

beforeEach(() => { viewport.mobile = true; });

describe("Run30 stable mobile stage details", () => {
  it("keeps next and upcoming summaries in the base list and opens only the requested workout outline", async () => {
    const { api } = renderProgram();
    const base = baseStages();
    expect(within(base).queryByTestId("run30-stage-1")).not.toBeInTheDocument();
    expect(within(base).getByTestId("run30-stage-2")).toHaveTextContent("예정");
    expect(within(base).getByTestId("run30-stage-3")).toHaveTextContent("3단계 걷기·달리기");
    expect(within(base).queryByText("몸풀기 걷기")).not.toBeInTheDocument();
    const summaryBefore = base.textContent;
    expect(within(screen.getByTestId("K4-R-6")).getByText("총 운동시간")).toBeVisible();
    expect(screen.getByText("러닝 시작은 O-Rider 앱에서 할 수 있어요.")).toBeVisible();
    expect(screen.getByText("통증이나 질병 증상이 있으면 달리기를 멈추고 회복하세요.")).toBeVisible();

    fireEvent.click(stageEntry(2));
    const dialog = await screen.findByRole("dialog", { name: "2단계 · 구간 2개 보기" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(dialog).toHaveTextContent("2단계 걷기·달리기");
    expect(dialog).not.toHaveTextContent("3단계 걷기·달리기");
    expect(within(dialog).getAllByText("몸풀기 걷기")[0]).toBeVisible();
    expect(base.textContent).toBe(summaryBefore);
    expect(screen.getByTestId("run30-route")).toHaveTextContent("sport=run&detail=run30-stage-2-detail");
    expect(api.previewChange).not.toHaveBeenCalled();
    expect(api.confirmChange).not.toHaveBeenCalled();
  });

  it("shows past stage outlines in one detail without nested detail entry points", async () => {
    renderProgram();
    fireEvent.click(within(baseStages()).getByRole("button", { name: "지난 단계 1개 보기 →" }));
    const dialog = await screen.findByRole("dialog", { name: "지난 단계 1개 보기" });
    const past = within(dialog).getByTestId("run30-past-stage-1");
    expect(past).toHaveTextContent("완료");
    expect(within(past).getAllByText("몸풀기 걷기")[0]).toBeVisible();
    expect(within(dialog).queryByTestId("run30-stage-2")).not.toBeInTheDocument();
    expect(within(dialog).queryAllByRole("button", { name: /구간 .* 보기/ })).toHaveLength(0);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("preserves query, browser Back/Forward and direct reload entry for a selected stage", async () => {
    let navigate: NavigateFunction | undefined;
    const view = renderProgram({ route: "/ko/coach/plan?sport=run&date=2026-10-02", onNavigate: driver => { navigate = driver; } });
    fireEvent.click(stageEntry(3));
    expect(await screen.findByRole("dialog", { name: "3단계 · 구간 2개 보기" })).toBeVisible();
    expect(screen.getByTestId("run30-route")).toHaveTextContent("sport=run&date=2026-10-02&detail=run30-stage-3-detail");
    await act(async () => { await navigate?.(-1); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => { await navigate?.(1); });
    expect(await screen.findByRole("dialog", { name: "3단계 · 구간 2개 보기" })).toBeVisible();
    const reloadRoute = screen.getByTestId("run30-route").textContent!;
    view.unmount();
    renderProgram({ route: reloadRoute });
    const restored = screen.getByRole("dialog", { name: "3단계 · 구간 2개 보기" });
    expect(restored).toHaveTextContent("3단계 걷기·달리기");
    fireEvent.click(within(restored).getByRole("button", { name: /뒤로/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("run30-route")).toHaveTextContent("/ko/coach/plan?sport=run&date=2026-10-02&detail=closed");
  });

  it("keeps all completed stages accessible from the finished program", async () => {
    renderProgram({ finished: true });
    expect(within(baseStages()).queryByTestId("run30-stage-1")).not.toBeInTheDocument();
    fireEvent.click(within(baseStages()).getByRole("button", { name: "지난 단계 3개 보기 →" }));
    const dialog = await screen.findByRole("dialog", { name: "지난 단계 3개 보기" });
    for (const stage of [1, 2, 3]) expect(within(dialog).getByTestId(`run30-past-stage-${stage}`)).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /단계 시작/ })).not.toBeInTheDocument();
  });

  it.each(["?sport=run&detail=run30-stage-2-detail", "?sport=run#run30-stage-2-detail"])("keeps bookmarked stages available after completion at %s", async suffix => {
    renderProgram({ finished: true, route: `/ko/coach/plan${suffix}` });
    const dialog = screen.getByRole("dialog", { name: "2단계 · 구간 2개 보기" });
    expect(within(dialog).getByTestId("run30-past-stage-2")).toHaveTextContent("완료");
    expect(within(dialog).getAllByText("몸풀기 걷기")[0]).toBeVisible();
    expect(within(dialog).queryByTestId("run30-past-stage-1")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /뒤로/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(baseStages()).getByRole("button", { name: "지난 단계 3개 보기 →" })).toBeVisible();
  });

  it("preserves the expanded next workout and past-list toggle on desktop web", () => {
    viewport.mobile = false;
    renderProgram();
    const base = baseStages();
    expect(within(within(base).getByTestId("run30-stage-2")).getAllByText("몸풀기 걷기")[0]).toBeVisible();
    const past = within(base).getByRole("button", { name: "지난 단계 1개 보기" });
    expect(past).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(past);
    expect(past).toHaveAttribute("aria-expanded", "true");
    expect(within(base).getByTestId("run30-stage-1")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["host-unsupported", "host"] as const)("keeps the mobile %s app's legacy expansion behavior", kind => {
    const mode: Run30StartMode = kind === "host" ? { kind, starter: { start: vi.fn() } } : { kind };
    renderProgram({ mode, route: "/ko/coach/plan?sport=run&detail=run30-stage-2-detail" });
    const base = baseStages();
    expect(within(within(base).getByTestId("run30-stage-2")).getAllByText("몸풀기 걷기")[0]).toBeVisible();
    expect(within(base).getByRole("button", { name: "구간 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(within(base).getByRole("button", { name: "지난 단계 1개 보기" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
