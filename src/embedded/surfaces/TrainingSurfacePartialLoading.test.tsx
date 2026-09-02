import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fitnessModel: {} as Record<string, unknown>,
  planModel: {} as Record<string, unknown>,
}));

vi.mock("../../hooks/useFitnessModel", () => ({
  useFitnessModel: () => mocks.fitnessModel,
}));

vi.mock("../../hooks/usePlanModel", () => ({
  usePlanModel: () => mocks.planModel,
}));

vi.mock("../../components/mobile/MobileFitnessPage", () => ({
  default: ({ sectionState }: {
    sectionState: {
      trend: string;
      derived: string;
      onRetryTrend?: () => void;
      retryLabel?: string;
    };
  }) => (
    <div>
      <span>trend {sectionState.trend}</span>
      <span>derived {sectionState.derived}</span>
      {sectionState.trend === "error" && sectionState.onRetryTrend && (
        <button type="button" onClick={sectionState.onRetryTrend}>{sectionState.retryLabel}</button>
      )}
    </div>
  ),
}));

vi.mock("../../features/training/plan/PlanPresentation", () => ({
  default: () => <div>plan presentation</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      "button.loading": "불러오는 중…",
      "button.retry": "다시 시도",
      "error.title": "문제가 발생했어요",
      goal: "목표",
      "page.planTitle": "운동 계획",
    })[key] ?? key,
  }),
}));

import FitnessSurface from "./FitnessSurface";
import PlanSurface from "./PlanSurface";

function wrapper(children: ReactNode) {
  return <MemoryRouter initialEntries={["/ko/embed/fitness?sport=bike"]}>{children}</MemoryRouter>;
}

describe("training embedded surface partial loading", () => {
  beforeEach(() => {
    mocks.fitnessModel = {
      loading: false,
      cacheHit: false,
      freshLoaded: true,
      derivedMetricsSettled: true,
      derivedMetricsError: false,
      error: null,
      timeseriesLoaded: false,
      timeseriesError: null,
      mobilePageProps: {},
      t: (key: string) => key,
      retryLoad: vi.fn(),
    };
    mocks.planModel = {
      goal: null,
      goalLoading: true,
      planLoading: true,
      goalError: null,
      planError: null,
      loading: true,
      cacheHit: false,
      freshLoaded: false,
      loadError: null,
      retryLoad: vi.fn(),
    };
  });

  it("renders fitness derived content while the core timeseries is still loading", async () => {
    const onReady = vi.fn();
    const view = render(wrapper(
      <FitnessSurface onReady={onReady} retryKey={0} />,
    ));

    expect(screen.getByText("trend loading")).toBeInTheDocument();
    expect(screen.getByText("derived ready")).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();

    mocks.fitnessModel.timeseriesLoaded = true;
    view.rerender(wrapper(
      <FitnessSurface onReady={onReady} retryKey={0} />,
    ));

    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh", true));
    expect(screen.getByText("trend ready")).toBeInTheDocument();
  });

  it("retries a fitness data failure and settles fresh exactly once", async () => {
    const onReady = vi.fn();
    const retryLoad = vi.fn();
    mocks.fitnessModel.error = "failed";
    mocks.fitnessModel.timeseriesLoaded = true;
    mocks.fitnessModel.retryLoad = retryLoad;

    const view = render(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByRole("alert")).toHaveTextContent("error.dataFailed");
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("error", true));
    await act(async () => screen.getByRole("button", { name: "다시 시도" }).click());
    expect(retryLoad).toHaveBeenCalledTimes(1);

    mocks.fitnessModel.error = null;
    view.rerender(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh", true));
    expect(onReady.mock.calls).toEqual([["error", true], ["fresh", true]]);
  });

  it("retries a fitness timeseries failure and settles fresh exactly once", async () => {
    const onReady = vi.fn();
    const retryLoad = vi.fn();
    mocks.fitnessModel.timeseriesLoaded = true;
    mocks.fitnessModel.timeseriesError = new Error("failed");
    mocks.fitnessModel.retryLoad = retryLoad;

    const view = render(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByText("trend error")).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("error", true));
    await act(async () => screen.getByRole("button", { name: "다시 시도" }).click());
    expect(retryLoad).toHaveBeenCalledTimes(1);

    mocks.fitnessModel.timeseriesError = null;
    view.rerender(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh", true));
    expect(onReady.mock.calls).toEqual([["error", true], ["fresh", true]]);
  });

  it("shows the accepted plan goal before its week collection finishes", () => {
    mocks.planModel = {
      ...mocks.planModel,
      goal: { title: "서울 10K" },
      goalLoading: false,
      planLoading: true,
    };

    render(wrapper(<PlanSurface onReady={vi.fn()} retryKey={0} />));

    expect(screen.getByRole("heading", { name: "서울 10K" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중…");
    expect(screen.queryByText("plan presentation")).not.toBeInTheDocument();
  });

  it("shows cached Plan content immediately before fresh revalidation completes", async () => {
    const onReady = vi.fn();
    mocks.planModel = {
      ...mocks.planModel,
      goal: { title: "캐시된 목표" },
      goalLoading: false,
      planLoading: false,
      loading: false,
      cacheHit: true,
      freshLoaded: false,
    };

    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByText("plan presentation")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("cached"));
  });

  it("reports cached and fresh base readiness while derived metrics remain loading", async () => {
    const onReady = vi.fn();
    mocks.fitnessModel = {
      ...mocks.fitnessModel,
      cacheHit: true,
      freshLoaded: true,
      timeseriesLoaded: true,
      derivedMetricsSettled: false,
    };
    const view = render(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByText("derived loading")).toBeInTheDocument();
    await waitFor(() => expect(onReady.mock.calls).toEqual([
      ["cached", false],
      ["fresh", false],
    ]));

    mocks.fitnessModel.derivedMetricsSettled = true;
    view.rerender(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByText("derived ready")).toBeInTheDocument();
    await waitFor(() => expect(onReady.mock.calls).toEqual([
      ["cached", false],
      ["fresh", false],
      ["cached", true],
      ["fresh", true],
    ]));
  });

  it("keeps derived metrics failure inline without turning base readiness into surface error", async () => {
    const onReady = vi.fn();
    mocks.fitnessModel = {
      ...mocks.fitnessModel,
      timeseriesLoaded: true,
      derivedMetricsSettled: true,
      derivedMetricsError: true,
    };

    render(wrapper(<FitnessSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByText("derived error")).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh", false));
  });

  it("keeps a plan week failure inline and exposes retry", async () => {
    const onReady = vi.fn();
    const retryLoad = vi.fn();
    mocks.planModel = {
      ...mocks.planModel,
      goal: { title: "서울 10K" },
      goalLoading: false,
      planLoading: false,
      planError: new Error("failed"),
      loadError: new Error("failed"),
      loading: false,
      freshLoaded: true,
      retryLoad,
    };

    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));

    expect(screen.getByRole("alert")).toHaveTextContent("문제가 발생했어요");
    await act(async () => screen.getByRole("button", { name: "다시 시도" }).click());
    expect(retryLoad).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("error"));
  });
});
