import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RunRecordBanner from "./RunRecordBanner";
import type { RunPrTable } from "@shared/types/personal-records";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
import { track } from "../../services/analytics";

const e = (value: number, activityId: string) => ({ value, activityId, date: "2026-07-10", startTime: 0 });

describe("RunRecordBanner", () => {
  it("이 활동이 현행 최고면 배너를 띄우고 단축 초를 보여준다", () => {
    const run: RunPrTable = { "5km": [e(1600, "today"), e(1641, "old")] };
    render(<RunRecordBanner run={run} activityId="today" />);
    expect(screen.getByText(/5km 최고 기록! 26'40"/)).toBeInTheDocument();
    expect(screen.getByText(/41초 단축/)).toBeInTheDocument();
  });

  it("첫 기록이면 '첫 기록이에요'", () => {
    render(<RunRecordBanner run={{ "1km": [e(280, "today")] }} activityId="today" />);
    expect(screen.getByText(/첫 기록이에요/)).toBeInTheDocument();
  });

  it("이 활동이 최고가 아니면 렌더하지 않는다", () => {
    const { container } = render(
      <RunRecordBanner run={{ "5km": [e(1600, "other"), e(1650, "today")] }} activityId="today" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("여러 거리를 갱신하면 가장 긴 거리를 배너로, 나머지는 개수로 안내", () => {
    const run: RunPrTable = {
      "1km": [e(275, "today")],
      "5km": [e(1600, "today")],
    };
    render(<RunRecordBanner run={run} activityId="today" />);
    expect(screen.getByText(/5km 최고 기록/)).toBeInTheDocument();
    expect(screen.getByText(/다른 거리 1개도 갱신/)).toBeInTheDocument();
  });

  it("기록이 없으면 렌더하지 않는다", () => {
    const { container } = render(<RunRecordBanner run={undefined} activityId="today" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RunRecordBanner — 공유", () => {
  const run: RunPrTable = { "5km": [e(1600, "today"), e(1641, "old")] };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", { value: { href: "https://orider.co.kr/ko/activity/today" }, writable: true });
  });
  afterEach(() => {
    // @ts-expect-error 테스트 정리용 navigator.share 삭제
    delete navigator.share;
  });

  it("navigator.share 가 있으면 기록 문구+URL 로 네이티브 공유", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
    render(<RunRecordBanner run={run} activityId="today" />);
    fireEvent.click(screen.getByRole("button", { name: /공유/ }));
    await vi.waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.text).toContain("5km");
    expect(arg.text).toContain("41초 단축");
    expect(arg.url).toContain("/activity/today");
  });

  it("공유하면 or_run_record_share 이벤트를 거리와 함께 보낸다", async () => {
    Object.defineProperty(navigator, "share", { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    render(<RunRecordBanner run={run} activityId="today" />);
    fireEvent.click(screen.getByRole("button", { name: /공유/ }));
    expect(track).toHaveBeenCalledWith("or_run_record_share", { distance: "5km" });
  });

  it("navigator.share 가 없으면 클립보드로 폴백", async () => {
    // @ts-expect-error 폴백 경로 테스트를 위해 navigator.share 제거
    delete navigator.share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RunRecordBanner run={run} activityId="today" />);
    fireEvent.click(screen.getByRole("button", { name: /공유/ }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("/activity/today");
  });
});
