import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocs, onSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import SimilarRouteHistoryPanel from "./SimilarRouteHistoryPanel";
const locale = vi.hoisted(() => ({ language: "ko" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: locale.language }, t: (key: string, params?: Record<string, unknown>) => {
  let value: unknown = locale.language === "ko" ? ko : en;
  for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part];
  return typeof value === "string" ? value.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
} }) }));
const activity = (id: string, startTime: number, movingTimeSec: number | undefined = 120) => ({ id, userId: "owner", startTime, type: "Ride", description: id, summary: { distance: 1609.344, movingTimeSec, pauseTimeSec: 0 } }) as Activity;
const current = activity("current", Date.parse("2026-10-10T09:00:00+09:00"));
const previous = activity("previous", Date.parse("2026-10-08T09:00:00+09:00"));
beforeEach(() => { locale.language = "ko"; });
describe("SimilarRouteHistoryPanel", () => {
  it("shows current activity separately, source link and one comparison callback without reads", () => {
    const onCompare = vi.fn(), reads = vi.mocked(getDocs).mock.calls.length, subscriptions = vi.mocked(onSnapshot).mock.calls.length;
    render(<SimilarRouteHistoryPanel current={current} candidates={[previous]} checkedCount={3} loadedCount={3} hasMore selectedId="" units="metric" onCompare={onCompare} />);
    expect(screen.getByText(/현재 활동 · 차트와 분리 표시/)).toBeInTheDocument();
    expect(screen.getByText(ko.similarRouteHistory.recordOrder)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /previous/ })).toHaveAttribute("href", "/ko/activity/previous");
    const source = screen.getByRole("link", { name: /previous/ }).closest("li")!;
    fireEvent.click(within(source).getByRole("button", { name: "이 활동과 비교" }));
    expect(onCompare).toHaveBeenCalledExactlyOnceWith("previous");
    const metrics = screen.getByText("거리 · km", { selector: "button *" }).closest<HTMLButtonElement>("button")!.parentElement!;
    fireEvent.click(within(metrics).getByRole("button", { name: "거리 · km" }));
    fireEvent.click(within(metrics).getByRole("button", { name: "정지시간" }));
    expect(getDocs).toHaveBeenCalledTimes(reads); expect(onSnapshot).toHaveBeenCalledTimes(subscriptions);
  });
  it("does not connect the chart through a missing moving-time value or substitute elapsed time", () => {
    const missing = { ...activity("missing", previous.startTime + 1000, undefined), summary: { distance: 1609.344, ridingTimeMillis: 300000 } } as Activity;
    const later = activity("later", previous.startTime + 2000, 150);
    render(<SimilarRouteHistoryPanel current={current} candidates={[later, missing, previous]} checkedCount={3} loadedCount={3} hasMore={false} selectedId="previous" units="metric" onCompare={vi.fn()} />);
    const chart = screen.getByRole("img");
    expect(chart.querySelectorAll("circle")).toHaveLength(2);
    expect(chart.querySelectorAll("line")).toHaveLength(1);
    expect(chart.querySelectorAll("circle[r='6']")).toHaveLength(1);
    const missingRow = screen.getByRole("link", { name: /missing/ }).closest("li")!;
    expect(within(missingRow).getAllByText("—")).toHaveLength(2);
  });
  it("states the 50-record search cap and loaded scope in English with imperial distances", () => {
    locale.language = "en";
    render(<SimilarRouteHistoryPanel current={current} candidates={[previous]} checkedCount={50} loadedCount={60} hasMore selectedId="" units="imperial" onCompare={vi.fn()} />);
    expect(screen.getByText(/50 checked records among 60 loaded/)).toBeInTheDocument();
    expect(screen.getByText(en.similarRouteHistory.recordOrder)).toBeInTheDocument();
    expect(screen.getByText(/only the first 50 records/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Distance · mi" }));
    expect(screen.getAllByText("1.00")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /previous/ })).toHaveAttribute("href", "/en/activity/previous");
  });
  it("renders no fabricated chart when all selected values are missing", () => {
    const source = { ...previous, summary: { distance: 1609.344, ridingTimeMillis: 120000 } } as Activity;
    render(<SimilarRouteHistoryPanel current={current} candidates={[source]} checkedCount={1} loadedCount={1} hasMore={false} selectedId="" units="metric" onCompare={vi.fn()} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(ko.similarRouteHistory.noMetric)).toBeInTheDocument();
  });
});
