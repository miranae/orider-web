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
  it("모든 거리와 원본을 표시하지만 미확인 값의 시간·페이스는 숨긴다", () => {
    const run: RunPrTable = { "1km": [e(281)], "5km": [e(1600)] };
    render(<RunRecordsBoard run={run} />);
    expect(screen.queryByText(`4'41"`)).not.toBeInTheDocument();
    expect(screen.queryByText(`26'40"`)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/km/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText(/종목과 시간 단위를 확인할 수 없어/)).toBeInTheDocument();
  });

  it("미달성 거리는 '아직 없어요'로 자리를 남긴다", () => {
    render(<RunRecordsBoard run={{ "1km": [e(281)] }} />);
    expect(screen.getAllByText("아직 없어요")).toHaveLength(4); // 5km, 10km, half, full
  });

  it("긴 저장값도 확인 없이 시간을 만들어 표시하지 않는다", () => {
    render(<RunRecordsBoard run={{ "10km": [e(3661)] }} />); // 1:01'01"
    expect(screen.queryByText(`1:01'01"`)).not.toBeInTheDocument();
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
  it("retains three saved sources and full dates without presenting unqualified ranking or deltas", () => {
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
    expect(screen.queryByText(/저장된 최고보다/)).not.toBeInTheDocument();
    expect(screen.getAllByText("출처 미확인")).toHaveLength(3);
    expect(screen.getByText(/전체 이력이나 활동 당시/)).toBeInTheDocument();
  });

  it("omits invalid time values and never creates a link without a source activity", () => {
    render(<RunRecordsBoard run={{ "1km": [
      { ...e(281, "2026-02-30"), activityId: "" }, e(0), e(Number.NaN), e(-1),
    ] }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(`4'41"`)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("keeps fractional legacy values unqualified instead of rounding them into elapsed times", () => {
    render(<RunRecordsBoard run={{ "1km": [e(299.6)] }} />);
    expect(screen.queryByText(`5'00"`)).not.toBeInTheDocument();
    expect(screen.queryByText(`4'60"`)).not.toBeInTheDocument();
  });

  it("does not derive imperial pace from unverified legacy values", () => {
    locale.units = "imperial";
    try {
      render(<RunRecordsBoard run={{ "5km": [e(1600)] }} />);
      expect(screen.queryByText(/\/mi/)).not.toBeInTheDocument();
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
      expect(screen.getByText("Source unverified")).toBeInTheDocument();
      expect(screen.getByText(/time and pace are hidden/)).toBeInTheDocument();
    } finally { await i18n.changeLanguage("ko"); }
  });

  it("never presents the suspicious historical bike-like values as running time or pace", () => {
    render(<RunRecordsBoard run={{ "1km": [e(39)], "5km": [e(206)], "10km": [e(413)] }} />);
    expect(screen.queryByText(/0'39|3'26|6'53|\/km/)).not.toBeInTheDocument();
    expect(screen.getAllByText("출처 미확인")).toHaveLength(3);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
