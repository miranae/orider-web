import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "i18next";
import enFitness from "../../i18n/resources/en/fitness.json";
import RunRecordsBoard from "./RunRecordsBoard";
import type { RunPrTable } from "@shared/types/personal-records";

const locale = vi.hoisted(() => ({ units: "metric" }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => locale }));

const e = (value: number, date = "2026-07-01") => ({ value, activityId: "a", date, startTime: 0 });

describe("RunRecordsBoard", () => {
  it("모든 거리를 표시하고 기록을 시간·페이스로 보여준다", () => {
    const run: RunPrTable = { "1km": [e(281)], "5km": [e(1600)] };
    render(<RunRecordsBoard run={run} />);
    // 1km 281초 = 4'41"
    expect(screen.getByText(`4'41"`)).toBeInTheDocument();
    // 5km 1600초 = 26'40", 페이스 320초/km = 5'20"/km
    expect(screen.getByText(`26'40"`)).toBeInTheDocument();
    expect(screen.getByText(`5'20"/km`)).toBeInTheDocument();
  });

  it("미달성 거리는 '아직 없어요'로 자리를 남긴다", () => {
    render(<RunRecordsBoard run={{ "1km": [e(281)] }} />);
    expect(screen.getAllByText("아직 없어요")).toHaveLength(4); // 5km, 10km, half, full
  });

  it("하프 이상 시간은 시:분'초\" 로 표기 (10km 를 h 단위로)", () => {
    render(<RunRecordsBoard run={{ "10km": [e(3661)] }} />); // 1:01'01"
    expect(screen.getByText(`1:01'01"`)).toBeInTheDocument();
  });

  it("디테일 레이어가 있으면 접이 토글을 노출하고 펼칠 수 있다", () => {
    render(<RunRecordsBoard run={{ "1km": [e(281)] }} detailLayer={<div>곡선</div>} />);
    const toggle = screen.getByRole("button", { name: /임계 페이스 곡선/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("곡선")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("곡선")).toBeInTheDocument();
  });

  it("디테일 레이어가 없으면 토글을 숨긴다", () => {
    render(<RunRecordsBoard run={{ "1km": [e(281)] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("기록이 전혀 없어도 다섯 거리의 빈 자리를 보여준다", () => {
    render(<RunRecordsBoard run={undefined} />);
    expect(screen.getAllByText("아직 없어요")).toHaveLength(5);
  });
  it("shows three saved records, full dates, source activities and deltas without implying progression", () => {
    render(<RunRecordsBoard run={{ "1km": [
      { ...e(310, "2025-07-01"), activityId: "third" },
      { ...e(280), activityId: "best" },
      { ...e(300), activityId: "second" },
      { ...e(330), activityId: "fourth" },
    ] }} />);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      "/ko/activity/best", "/ko/activity/second", "/ko/activity/third",
    ]);
    expect(screen.getByText(/2025.*7.*1/)).toBeInTheDocument();
    expect(screen.getByText(`저장된 최고보다 +0'20"`)).toBeInTheDocument();
    expect(screen.getByText(/전체 이력이나 활동 당시/)).toBeInTheDocument();
  });

  it("omits invalid time values and never creates a link without a source activity", () => {
    render(<RunRecordsBoard run={{ "1km": [
      { ...e(281, "2026-02-30"), activityId: "" }, e(0), e(Number.NaN), e(-1),
    ] }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(`4'41"`)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("rounds duration before separating minutes and seconds", () => {
    render(<RunRecordsBoard run={{ "1km": [e(299.6)] }} />);
    expect(screen.getByText(`5'00"`)).toBeInTheDocument();
    expect(screen.queryByText(`4'60"`)).not.toBeInTheDocument();
  });

  it("uses imperial pace while retaining the actual record distance", () => {
    locale.units = "imperial";
    try {
      render(<RunRecordsBoard run={{ "5km": [e(1600)] }} />);
      expect(screen.getByText(`8'35"/mi`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "5km" })).toBeInTheDocument();
    } finally { locale.units = "metric"; }
  });

  it("localizes the full calendar date and activity source path in English", async () => {
    i18n.addResourceBundle("en", "fitness", enFitness, true, true);
    await i18n.changeLanguage("en");
    try {
      render(<RunRecordsBoard run={{ "1km": [{ ...e(281, "2025-07-01"), activityId: "source/id" }] }} />);
      expect(screen.getByRole("link").getAttribute("href")).toBe("/en/activity/source%2Fid");
      expect(screen.getByRole("link")).toHaveTextContent("7/1/2025");
      expect(screen.getByText("Current saved best")).toBeInTheDocument();
    } finally { await i18n.changeLanguage("ko"); }
  });

});
