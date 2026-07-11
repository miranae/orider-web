import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RunEmptyState from "./RunEmptyState";

const connectStrava = vi.fn();
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava }) }));
vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
import { track } from "../../services/analytics";

describe("RunEmptyState — 미연결", () => {
  beforeEach(() => vi.clearAllMocks());

  it("빈 화면 대신 '연결하면 무엇을 받는지'를 헤드라인으로 말한다", () => {
    render(<RunEmptyState stravaConnected={false} />);
    expect(screen.getByRole("heading")).toHaveTextContent("여기서 러닝을 해석해 드려요");
  });

  it("연결 CTA 를 누르면 Strava 연결을 시작하고 전환을 계측한다", () => {
    render(<RunEmptyState stravaConnected={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Strava 계정 연결하기/ }));
    expect(connectStrava).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledWith("or_run_empty_state_cta", { stravaConnected: false });
  });

  it("노출 자체도 계측한다 (샘플 카드 A/B 의 분모)", () => {
    render(<RunEmptyState stravaConnected={false} />);
    expect(track).toHaveBeenCalledWith("or_run_empty_state_view", { stravaConnected: false });
  });

  it("샘플 카드는 가상 데이터임을 라벨로 밝힌다", () => {
    render(<RunEmptyState stravaConnected={false} />);
    expect(screen.getByText("미리보기")).toBeInTheDocument();
  });
});

describe("RunEmptyState — 연결됨 (첫 러닝 대기)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("이미 연결됐으면 CTA 대신 대기 문구를 보여준다", () => {
    render(<RunEmptyState stravaConnected />);
    expect(screen.getByRole("heading")).toHaveTextContent("첫 러닝이 도착하면 알려드릴게요");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("용어가 처음인 방문자를 위한 매뉴얼 우회로가 있다", () => {
    render(<RunEmptyState stravaConnected />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/web-manual/ch08-multisport.html");
  });
});
