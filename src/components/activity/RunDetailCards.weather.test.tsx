import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Activity, ActivitySummary } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { RunRightCards } from "./RunDetailCards";

const summary = { tss: 40 } as unknown as ActivitySummary;

const deviceWeather = {
  temperature: 11, feelsLike: 9, windSpeed: 2, humidity: 40, precipitation: 0,
} as unknown as Activity["weather"];

const activity = { weather: deviceWeather } as unknown as Activity;

const serverWeather: ActivityMetrics["weather"] = {
  tempC: 23.4, humidity: null, windSpeed: 5, condition: "wmo_61",
};

function renderCard(props: Parameters<typeof RunRightCards>[0]) {
  return render(<RunRightCards {...props} />);
}

describe("WeatherCard 정본 전환 (#887)", () => {
  afterEach(() => resetRuntimeConfigForTests());

  it("전환이 꺼져 있으면 오늘 그대로 기기 기록만 그린다", () => {
    resetRuntimeConfigForTests({});
    renderCard({ summary, activity, metricsWeather: serverWeather, metricsStatus: "ready" });
    expect(screen.getByText("11 °C")).toBeInTheDocument();
    expect(screen.queryByText("23 °C")).not.toBeInTheDocument();
    expect(screen.queryByText("기기 기록")).not.toBeInTheDocument();
  });

  it("ready 면 서버 값을 쓰고 기기 값은 같은 화면에 두지 않는다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    renderCard({ summary, activity, metricsWeather: serverWeather, metricsStatus: "ready" });
    expect(screen.getByText("23 °C")).toBeInTheDocument();
    expect(screen.queryByText("11 °C")).not.toBeInTheDocument();
    expect(screen.getByText("비")).toBeInTheDocument();
    expect(screen.getByText("5 m/s")).toBeInTheDocument();
    // humidity 가 null 이면 그 줄은 아예 없다 — 0% 로 채우지 않는다.
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("이전 분석")).not.toBeInTheDocument();
  });

  it("stale 이면 값과 함께 표식을 붙인다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    renderCard({ summary, activity, metricsWeather: serverWeather, metricsStatus: "stale" });
    expect(screen.getByText("23 °C")).toBeInTheDocument();
    expect(screen.getByText("이전 분석")).toBeInTheDocument();
  });

  it("계산 중이면 숫자를 지어내지 않는다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    renderCard({ summary, activity, metricsWeather: undefined, metricsStatus: "loading" });
    expect(screen.getByText("날씨를 계산하고 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("11 °C")).not.toBeInTheDocument();
  });

  it("서버 문서가 없으면 기기 기록으로 떨어지되 출처를 밝힌다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    renderCard({ summary, activity, metricsWeather: undefined, metricsStatus: "missing" });
    expect(screen.getByText("11 °C")).toBeInTheDocument();
    expect(screen.getByText("기기 기록")).toBeInTheDocument();
  });

  it("두 출처가 모두 없으면 카드를 그리지 않는다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    renderCard({ summary, activity: {} as Activity, metricsWeather: undefined, metricsStatus: "missing" });
    expect(screen.queryByText("환경")).not.toBeInTheDocument();
  });
});
