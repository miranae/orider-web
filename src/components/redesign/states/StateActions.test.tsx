import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ErrorState from "./ErrorState";
import PermissionGate from "./PermissionGate";
import ChartEmptyState from "../../charts/ChartEmptyState";

const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("상태 상자 해결 행동", () => {
  it("ErrorState 는 다시 시도와 함께 해결 화면 링크를 담는다", () => {
    wrap(<ErrorState title="불러오지 못했어요" onRetry={() => {}} actions={[{ label: "연결 설정", href: "/settings/connections" }]} />);
    expect(screen.getByRole("button", { name: /다시|retry/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "연결 설정" }).getAttribute("href")).toContain("/settings/connections");
  });

  it("ChartEmptyState 는 행동을 버리지 않는다", () => {
    wrap(<ChartEmptyState title="데이터 없음" description="가져오면 채워져요" actions={[{ label: "활동 가져오기", href: "/athlete/me/activities" }]} />);
    expect(screen.getByRole("link", { name: "활동 가져오기" })).toBeInTheDocument();
  });

  it("제목만 받은 권한 없음 관문은 로그인 안내를 붙이지 않고, 다음 단계 행동을 보인다", () => {
    wrap(<PermissionGate title="이 이벤트를 운영할 권한이 없습니다" actions={[{ label: "이벤트로", href: "/event/e1" }]} />);
    expect(screen.queryByText(/로그인/)).toBeNull();
    expect(screen.getByRole("link", { name: "이벤트로" })).toBeInTheDocument();
  });

  it("로그인 관문(onAction)은 기본 로그인 안내를 유지한다", () => {
    wrap(<PermissionGate title="로그인이 필요합니다" onAction={() => {}} />);
    expect(screen.getAllByText(/로그인/).length).toBeGreaterThan(1);
  });
});
