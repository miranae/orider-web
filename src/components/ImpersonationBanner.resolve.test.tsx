import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockSignOut, simulateLogin } from "../__tests__/mocks/firebase";
import ImpersonationBanner from "./ImpersonationBanner";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "qa-user", email: "qa@example.test" }, profile: { nickname: "검수 사용자" }, loading: false },
  showToast: vi.fn(),
  sessionAt: 1,
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("../services/impersonation", () => ({
  readImpersonation: () => ({ status: "active", state: { targetUid: "qa-user", by: "검수 관리자", at: mocks.sessionAt } }),
  readImpersonationState: () => ({ targetUid: "qa-user", by: "검수 관리자", at: mocks.sessionAt }),
  subscribeImpersonation: () => () => {},
  clearImpersonationState: vi.fn(),
}));

beforeEach(() => { mocks.showToast.mockReset(); mockSignOut.mockReset(); mocks.sessionAt = 1; simulateLogin({ uid: "qa-user" }); });
afterEach(cleanup);

// 종료 실패 알림 문구 자체를 누르면 종료를 다시 시도한다 — 아직 같은 위임 세션일 때만.
describe("위임 세션 종료 실패 알림", () => {
  it("알림을 누르면 같은 세션의 종료를 다시 시도한다", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    const options = mocks.showToast.mock.calls[0]![2] as { resolve: { onClick: () => void } };
    options.resolve.onClick();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(2));
  });

  it("다른 계정으로 바뀐 뒤에는 남은 알림을 눌러도 그 계정을 로그아웃시키지 않는다", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline"));
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    simulateLogin({ uid: "admin" });
    (mocks.showToast.mock.calls[0]![2] as { resolve: { onClick: () => void } }).resolve.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("같은 uid 로 새로 로그인한 세션이면 남은 알림을 눌러도 로그아웃시키지 않는다", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline"));
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    simulateLogin({ uid: "qa-user" }); // 같은 uid, 새 User 객체(다른 탭에서 로그아웃 뒤 재로그인)
    (mocks.showToast.mock.calls[0]![2] as { resolve: { onClick: () => void } }).resolve.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("위임 세션이 새로 시작됐으면(시작 시각이 다르면) 남은 알림을 눌러도 로그아웃시키지 않는다", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline"));
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    mocks.sessionAt = 2;
    (mocks.showToast.mock.calls[0]![2] as { resolve: { onClick: () => void } }).resolve.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
