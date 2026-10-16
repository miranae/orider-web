import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders as render } from "../../__tests__/utils/renderWithProviders";
import RunEmptyState from "./RunEmptyState";

const connectStrava = vi.fn();
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava }) }));
vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
import { track } from "../../services/analytics";

describe("RunEmptyState — 미연결", () => {
  beforeEach(() => vi.clearAllMocks());

  it("최근 기록이 없는 상태를 평생 기록 부재로 단정하지 않는다", () => {
    render(<RunEmptyState stravaConnected={false} />);
    expect(screen.getByRole("heading")).toHaveTextContent("최근 러닝 기록이 없어요");
  });

  it("연결 CTA 를 누르면 Strava 연결을 시작하고 전환을 계측한다", () => {
    render(<RunEmptyState stravaConnected={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Strava 계정 연결하기/ }));
    expect(connectStrava).toHaveBeenCalledWith("/?sport=run");
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

describe("RunEmptyState — 연결됨", () => {
  beforeEach(() => vi.clearAllMocks());

  it("이미 연결됐어도 러닝 파일을 가져올 수 있다", () => {
    render(<RunEmptyState stravaConnected />);
    expect(screen.getByRole("heading")).toHaveTextContent("최근 러닝 기록이 없어요");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "러닝 기록 가져오기" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run&import=1");
  });

  it("용어가 처음인 방문자를 위한 매뉴얼 우회로가 있다", () => {
    render(<RunEmptyState stravaConnected />);
    expect(screen.getByRole("link", { name: "쉬운 안내서 보기" })).toHaveAttribute("href", "/web-manual/ch08-multisport.html");
  });
});

it("Strava 미연결 상태에서도 파일 가져오기 경로를 제공한다", () => {
  render(<RunEmptyState stravaConnected={false} />);
  expect(screen.getByRole("link", { name: "러닝 기록 가져오기" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run&import=1");
});
