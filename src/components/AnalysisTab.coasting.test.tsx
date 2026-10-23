import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../contexts/ThemeContext";
import { OriderThemeProvider } from "../theme";
import koTerms from "../i18n/resources/ko/termGlossary.json";
import enTerms from "../i18n/resources/en/termGlossary.json";
import koActivity from "../i18n/resources/ko/activity.json";
import koGlossary from "../i18n/resources/ko/metricGlossary.json";
import enGlossary from "../i18n/resources/en/metricGlossary.json";
import enActivity from "../i18n/resources/en/activity.json";
import type { ActivityStreams } from "@shared/types";
import type { UseActivityMetricsState } from "../hooks/useActivityMetrics";

const state = vi.hoisted(() => ({ metrics: {} as UseActivityMetricsState, units: "metric" as "metric" | "imperial", language: null as "ko" | "en" | null }));
vi.mock("../hooks/useActivityMetrics", () => ({ useActivityMetrics: () => state.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: (namespace = "activity") => ({ t: (key: string, values?: Record<string, unknown>) => {
  if (!state.language) return key;
  const resource: unknown = namespace === "termGlossary" ? (state.language === "ko" ? koTerms : enTerms) : namespace === "metricGlossary" ? (state.language === "ko" ? koGlossary : enGlossary) : state.language === "ko" ? koActivity : enActivity;
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, resource);
  return typeof value === "string" ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) : key;
} }) }));
vi.mock("./ZoneDistributionChart", () => ({ default: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ locale: "ko", units: state.units }) }));

afterEach(() => { cleanup(); state.units = "metric"; state.language = null; });

import AnalysisTab from "./AnalysisTab";

/** 파워계 없이 심박·케이던스 센서만 있는 라이딩 — 코스팅(#3221)은 케이던스만으로 보인다. */
function cadenceOnlyRide(coasting: boolean): UseActivityMetricsState {
  return {
    status: "ready",
    metrics: {
      discipline: "bike", distanceKm: 42, durationSec: 6000, movingTimeSec: 5400,
      avgPower: null, np: null, avgHr: 138, maxHr: 171, avgCadence: 84,
      powerZoneSec: [], hrZoneSec: [], mmp: {},
      cyclingMetrics: { cadenceStdDev: 12, longestZ4PlusSec: null,
        ...(coasting ? { coastingPct: 22, coastingSec: 1188, longestCoastSec: 140 } : {}) },
    },
  } as unknown as UseActivityMetricsState;
}

const renderRide = () => render(
  <ThemeProvider><OriderThemeProvider><AnalysisTab activityId="strava_2" sport="ride" isOwner
    streams={{ time: [], distance: [] } as unknown as ActivityStreams} summary={{ distance: 42000 } as never} /></OriderThemeProvider></ThemeProvider>,
);

describe("자전거 코스팅 카드 (#3221)", () => {
  it("파워 없이 케이던스만 있어도 코스팅 비율과 쉰 시간을 보여준다", () => {
    state.language = "ko";
    state.metrics = cadenceOnlyRide(true);
    renderRide();
    expect(screen.getByText("코스팅")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText(/이동 중 페달을 쉰 시간/)).toBeInTheDocument();
    // 케이던스 센서의 분산은 파워 측정 여부와 독립적인 저장 값이다.
    expect(screen.getByText("케이던스 일관성")).toBeInTheDocument();
  });

  it("코스팅 값이 없으면 카드를 그리지 않는다(0 으로 채우지 않음)", () => {
    state.language = "ko";
    state.metrics = cadenceOnlyRide(false);
    renderRide();
    expect(screen.queryByText("코스팅")).not.toBeInTheDocument();
  });
});


it("preserves duration-only coasting and a measured zero without inventing a percentage", () => {
  state.language = "ko";
  state.metrics = cadenceOnlyRide(false);
  state.metrics.metrics!.cyclingMetrics = { cadenceStdDev: 12, longestZ4PlusSec: null, coastingSec: 0, longestCoastSec: 0 };
  renderRide();
  expect(screen.getByText("페달을 쉰 시간")).toBeInTheDocument();
  expect(screen.getByText("최장 연속 코스팅")).toBeInTheDocument();
  expect(screen.queryByText("코스팅")).not.toBeInTheDocument();
});


it("retains cadence variation without power, coasting or fabricated power metrics", () => {
  state.language = "ko";
  state.metrics = cadenceOnlyRide(false);
  renderRide();
  expect(screen.getByText("케이던스 일관성")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.queryByText("코스팅")).not.toBeInTheDocument();
  expect(screen.queryByText("최장 Z4+ 유지")).not.toBeInTheDocument();
});


it("keeps the previous-analysis status visible for saved cadence-only evidence", () => {
  state.language="ko";
  state.metrics={status:"stale",metrics:{version:1,computedAt:1700000000000,discipline:"bike",cyclingMetrics:{cadenceStdDev:7}}} as unknown as UseActivityMetricsState;
  renderRide();
  expect(screen.getByText("케이던스 일관성")).toBeVisible();
  expect(screen.getByText(koActivity.serverMetrics.staleChip)).toBeVisible();
});


it("does not render a non-finite saved cadence beside valid coasting zero", () => {
  state.language="ko";
  state.metrics={status:"ready",metrics:{discipline:"bike",cyclingMetrics:{cadenceStdDev:NaN,longestCoastSec:0}}} as unknown as UseActivityMetricsState;
  renderRide();
  expect(screen.queryByText("케이던스 일관성")).not.toBeInTheDocument();
  expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  expect(screen.getByText("최장 연속 코스팅")).toBeVisible();
});


it.each([{avgHr:120},{avgPower:180}])("retains the saved-only previous-analysis status for %j", sensor => {
  state.language="ko";
  state.metrics={status:"stale",metrics:{version:1,computedAt:1700000000000,discipline:"bike",...sensor}} as unknown as UseActivityMetricsState;
  renderRide();
  expect(screen.getByText(koActivity.serverMetrics.staleChip)).toBeVisible();
});
