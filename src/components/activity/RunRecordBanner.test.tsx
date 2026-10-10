import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as renderBase, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
const render = (ui: ReactElement) => renderBase(<MemoryRouter>{ui}</MemoryRouter>);
import RunRecordBanner from "./RunRecordBanner";
import type { RunPrTable } from "@shared/types/personal-records";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
import { track } from "../../services/analytics";

const e = (value: number, activityId: string) => ({ value, activityId, date: "2026-07-10", startTime: 0 });

describe("RunRecordBanner", () => {
  it("현재 저장된 최고를 중립적으로 보여주고 근거 활동으로 연결한다", () => {
    const run: RunPrTable = { "5km": [e(1600, "today"), e(1641, "old")] };
    render(<RunRecordBanner run={run} activityId="today" />);
    expect(screen.getByText(/현재 저장된 5km 최고 기록 · 26'40"/)).toBeInTheDocument();
    expect(screen.queryByText(/41초 단축/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "근거 활동 보기" })).toHaveAttribute("href", "/ko/activity/today");
  });

  it("유일 상위 기록도 최초라고 주장하지 않는다", () => {
    render(<RunRecordBanner run={{ "1km": [e(280, "today")] }} activityId="today" />);
    expect(screen.queryByText(/첫 기록이에요/)).not.toBeInTheDocument();
    expect(screen.getByText(/현재 저장된 1km 최고 기록/)).toBeInTheDocument();
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
    expect(screen.getByText(/다른 거리 1개도 현재 최고/)).toBeInTheDocument();
  });

  it("uses neutral joint-best wording for ties without an achievement claim", () => {
    render(<RunRecordBanner run={{ "5km": [e(1600, "today"), e(1600, "other")] }} activityId="today" />);
    expect(screen.getByText(/현재 저장된 5km 공동 최고 기록/)).toBeInTheDocument();
    expect(screen.queryByText(/초 단축|첫 기록이에요|기록을 갱신/)).not.toBeInTheDocument();
  });
  it("does not report an improvement relative to a later activity", () => {
    const run: RunPrTable = { "5km": [{ ...e(1600, "today"), startTime: 100 }, { ...e(1641, "future"), startTime: 200 }] };
    render(<RunRecordBanner run={run} activityId="today" />);
    expect(screen.getByText(/현재 저장된 5km 최고 기록/)).toBeInTheDocument();
    expect(screen.queryByText(/41초 단축|첫 기록이에요/)).not.toBeInTheDocument();
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
    expect(arg.text).toContain("현재 저장된 내 5km 최고 기록");
    expect(arg.text).not.toMatch(/단축|첫 기록|갱신/);
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
