import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FitnessPedalingEvidence from "./FitnessPedalingEvidence";

const state = vi.hoisted(() => ({ status: "ready", metrics: null as ActivityMetrics | null, ids: [] as Array<string | null> }));
vi.mock("../../../hooks/useActivityMetrics", () => ({ useActivityMetrics: (id: string | null) => { state.ids.push(id); return { status: state.status, metrics: state.metrics }; } }));
const ride = (id: string, startTime: number, averageCadence: number | null = null) => ({ id, startTime, type: "Ride", summary: { distance: 40000, averageCadence } }) as Activity;

beforeEach(() => { state.status = "ready"; state.metrics = null; state.ids = []; });
describe("FitnessPedalingEvidence", () => {
  it("shows stored single-ride cadence, quadrants, balance and efficiency without averaging", () => {
    state.metrics = { avgCadence: 86, quadrant: { q1Pct: 11, q2Pct: 22, q3Pct: 33, q4Pct: 34 }, cyclingMetrics: { cadenceStdDev: 7, coastingPct: 0, coastingSec: 0, longestCoastSec: 0, longestZ4PlusSec: 420 }, lrBalance: { avg: 51, asymmetryPct: 2 }, decoupling: { ef: 1.45, decouplingPct: 3.2, hrDriftPct: 0, basis: "power_hr" } } as ActivityMetrics;
    renderWithProviders(<FitnessPedalingEvidence activities={[ride("one", 1000000)]} locale="ko" />, { route: "/ko/coach/condition" });
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("49.0 / 51.0")).toBeInTheDocument();
    expect(screen.getByText("1.45")).toBeInTheDocument();
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getAllByText("0:00")).toHaveLength(2);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ko/activity/one?tab=analysis");
  });
  it("keeps sensor submetrics and quadrant meaning visible without opening explanations", () => {
    state.metrics = {
      avgCadence: 86, maxCadence: 121, avgHr: 135, maxHr: 178,
      quadrant: { q1Pct: 11, q2Pct: 22, q3Pct: 33, q4Pct: 34 },
      cyclingDynamics: {
        source: "records", sampleCount: 100, validSampleCount: 80, coverage: 0.8,
        balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
        pedalSmoothness: { leftAvgPct: 20, rightAvgPct: 22, combinedAvgPct: 21 },
        powerPhase: { left: { startDeg: 10, endDeg: 170, arcDeg: 160, peakStartDeg: 50, peakEndDeg: 100 } },
      },
    } as ActivityMetrics;
    renderWithProviders(<FitnessPedalingEvidence activities={[ride("one", 1000000)]} locale="ko" />);
    for (const value of ["121", "135", "178"]) expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText("고케이던스·고파워 비중")).toBeVisible();
    expect(screen.getByText("좌우 차이 2.0%p")).toBeVisible();
    expect(screen.getByText("통합 21.0%")).toBeVisible();
    expect(screen.getByText("유효 구간 160° · 피크 50°–100°")).toBeVisible();
    expect(screen.getByText(/80\/100/)).toBeVisible();
  });
  it("prefers a recent ride with cadence evidence and subscribes only to the chosen ride", () => {
    renderWithProviders(<FitnessPedalingEvidence activities={[ride("short", 3000000), ride("sensor", 2000000, 85), ride("old", 1000000, 80)]} locale="ko" />);
    expect(screen.getByRole("combobox")).toHaveValue("sensor");
    expect(new Set(state.ids)).toEqual(new Set(["sensor"]));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "short" } });
    expect(state.ids.at(-1)).toBe("short");
  });
  it("does not treat the compact fitness window as full pedaling metrics", () => {
    state.status = "missing";
    renderWithProviders(<FitnessPedalingEvidence activities={[ride("one", 1000000)]} metricsMap={new Map([["one", { mmp: { "5m": 250 } } as ActivityMetrics]])} locale="ko" />);
    expect(screen.getByText(/이 활동에 저장된 페달링 지표가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("250")).not.toBeInTheDocument();
  });
  it("clears the previous result when the selected activity is loading", () => {
    state.metrics = { avgCadence: 85 } as ActivityMetrics;
    const { rerender } = renderWithProviders(<FitnessPedalingEvidence activities={[ride("one", 1000000)]} locale="ko" />);
    expect(screen.getByText("85")).toBeInTheDocument();
    state.status = "loading"; state.metrics = null;
    rerender(<FitnessPedalingEvidence activities={[ride("two", 2000000)]} locale="ko" />);
    expect(screen.queryByText("85")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  });
  it("does not subscribe when there are no cycling activities", () => {
    renderWithProviders(<FitnessPedalingEvidence activities={[]} locale="ko" />);
    expect(state.ids).toEqual([]);
    expect(screen.getByText(/현재 불러온 목록에 분석할 라이딩이 없습니다/)).toBeInTheDocument();
  });
});
