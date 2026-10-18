import { setCallableResult } from "../../__tests__/mocks/firebase";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PaneConnections } from "./PaneConnections";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  disconnectStrava: vi.fn(),
  track: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: { stravaConnected: true, autoUpload: false } }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: mocks.confirm }),
}));
vi.mock("../../hooks/useStrava", () => ({
  useStrava: () => ({
    connectStrava: vi.fn(),
    disconnectStrava: mocks.disconnectStrava,
    loading: false,
  }),
}));
vi.mock("../../services/analytics", () => ({ track: mocks.track }));

describe("PaneConnections Strava disconnect observability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCallableResult("stravaSummarySettings", { data: { enabled: true, lang: "ko" } });
    mocks.confirm.mockReset();
    mocks.disconnectStrava.mockReset();
    mocks.track.mockReset();
    mocks.showToast.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("does not duplicate Apple Health as a coming-soon app and collapses future services", () => {
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);
    expect(screen.queryByText("Apple Health")).not.toBeInTheDocument();
    expect(screen.getByText("Garmin Connect").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("S2-1-4").querySelector("button")).toBeNull();
  });

  it("records intent and cancel without calling the backend", async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    expect(screen.getByRole("switch", { name: "Strava용 요약 자동 생성 및 게시" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(mocks.confirm).toHaveBeenCalledWith(
      "Strava 활동 동기화와 연결된 Strava 로그인을 함께 해제하시겠습니까?",
      { destructive: true },
    );

    const params = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      source: "web",
    };
    expect(mocks.track).toHaveBeenNthCalledWith(1, "strava_disconnect_intent", params);
    expect(mocks.track).toHaveBeenNthCalledWith(2, "strava_disconnect_cancel", params);
    expect(mocks.disconnectStrava).not.toHaveBeenCalled();
  });

  it("records confirmation and passes the same operation ID to the backend hook", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.disconnectStrava.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    const params = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      source: "web",
    };
    expect(mocks.track).toHaveBeenNthCalledWith(1, "strava_disconnect_intent", params);
    expect(mocks.track).toHaveBeenNthCalledWith(2, "strava_disconnect_confirm", params);
    expect(mocks.disconnectStrava).toHaveBeenCalledWith(params.operationId);
    expect(mocks.showToast).toHaveBeenCalledWith("연동이 해제되었습니다");
  });

  it("shows other-login guidance when the server protects the last sign-in method", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.disconnectStrava.mockRejectedValue({ code: "functions/failed-precondition", details: { reason: "last-login-method" } });
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    await userEvent.setup().click(screen.getByRole("button", { name: "연결 해제" }));

    expect(mocks.showToast).toHaveBeenCalledWith(
      "Strava가 마지막 로그인 방법입니다. 설정 > 계정에서 다른 로그인 방법을 먼저 연결하세요.", "error",
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith("연동이 해제되었습니다");
  });

  it("shows a retry message for other disconnect failures", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.disconnectStrava.mockRejectedValue({ code: "functions/unavailable" });
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    await userEvent.setup().click(screen.getByRole("button", { name: "연결 해제" }));

    expect(mocks.showToast).toHaveBeenCalledWith("Strava 연결을 해제하지 못했습니다. 잠시 후 다시 시도하세요.", "error");
  });
});
