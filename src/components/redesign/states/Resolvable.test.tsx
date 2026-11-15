import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import PermissionGate from "./PermissionGate";
import ChartEmptyState from "../../charts/ChartEmptyState";

const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("경고 문구 자체가 해결 경로다 (버튼을 덧붙이지 않는다)", () => {
  it("ErrorState 오류 문구를 누르면 해결 화면으로 가고, 새 버튼은 생기지 않는다", () => {
    wrap(<ErrorState title="Strava 연결이 끊겼어요" description="동기화가 멈췄어요" resolve={{ to: "/settings/connections" }} />);
    const link = screen.getByRole("link", { name: /Strava 연결이 끊겼어요/ });
    expect(link.getAttribute("href")).toContain("/settings/connections");
    expect(link.textContent).toContain("동기화가 멈췄어요");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("불러오기 실패 문구를 누르면 다시 불러온다", () => {
    const retry = vi.fn();
    wrap(<ErrorState title="불러오지 못했어요" resolve={{ onClick: retry }} />);
    fireEvent.click(screen.getByRole("button", { name: /불러오지 못했어요/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("해결 경로가 없으면 예전처럼 글자로만 보인다", () => {
    wrap(<EmptyState title="아직 기록이 없어요" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("아직 기록이 없어요")).toBeInTheDocument();
  });

  it("빈 차트 문구를 누르면 채우는 곳으로 간다", () => {
    wrap(<ChartEmptyState title="데이터 없음" description="기록이 쌓이면 채워져요" resolve={{ to: "/settings/connections" }} />);
    expect(screen.getByRole("link", { name: /데이터 없음/ }).getAttribute("href")).toContain("/settings/connections");
  });

  it("권한 없음 관문은 로그인 안내 없이, 문구를 누르면 돌아갈 곳으로 간다", () => {
    wrap(<PermissionGate title="이 이벤트를 운영할 권한이 없습니다" resolve={{ to: "/event/e1" }} />);
    expect(screen.queryByText(/로그인/)).toBeNull();
    expect(screen.getByRole("link", { name: "이 이벤트를 운영할 권한이 없습니다" }).getAttribute("href")).toContain("/event/e1");
  });

  it("로그인 관문(onAction)은 기본 로그인 안내를 유지한다", () => {
    wrap(<PermissionGate title="로그인이 필요합니다" onAction={() => {}} />);
    expect(screen.getAllByText(/로그인/).length).toBeGreaterThan(1);
  });
});
