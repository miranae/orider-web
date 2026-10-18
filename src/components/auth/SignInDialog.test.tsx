import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../../services/socialAuth", () => ({ startSocialAuth: mocks.start }));
import { SignInDialog } from "./SignInDialog";

describe("Strava sign-in choice", () => {
  beforeEach(() => { mocks.start.mockReset().mockResolvedValue(undefined); });

  it("uses the official button asset and starts the login flow, separate from activity sync", () => {
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "Strava로 계속하기" });
    expect(button.querySelector("img")).toHaveAttribute("src", "/btn_strava_connect_orange.svg");
    expect(screen.getByText("기존 계정이 있다면 로그인 후 설정에서 다른 로그인 방법을 연결하세요.")).toBeInTheDocument();
    expect(screen.queryByText(/공개 프로필 읽기 권한/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledWith("strava", "login");
  });

  it("recovers a failed Strava start so another login method can be chosen", async () => {
    mocks.start.mockRejectedValue(new Error("unavailable"));
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "Strava로 계속하기" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다");
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).not.toBeDisabled();
  });
});
