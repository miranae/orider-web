import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../../services/socialAuth", () => ({ startSocialAuth: mocks.start }));
import { SignInDialog } from "./SignInDialog";

describe("sign-in choices", () => {
  beforeEach(() => { mocks.start.mockReset().mockResolvedValue(undefined); });

  it("keeps Google, Naver, and Kakao available while hiding Strava sign-in", () => {
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "네이버로 계속하기" });
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Strava로 계속하기" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("A1-1-4")).not.toBeInTheDocument();
    expect(screen.getByText("기존 계정이 있다면 로그인 후 설정에서 다른 로그인 방법을 연결하세요.")).toBeInTheDocument();
    expect(screen.queryByText(/공개 프로필 읽기 권한/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledWith("naver", "login");
  });

  it("recovers a failed social start so another login method can be chosen", async () => {
    mocks.start.mockRejectedValue(new Error("unavailable"));
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "네이버로 계속하기" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다");
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).not.toBeDisabled();
  });

  it("keeps unrelated Strava guard errors generic and restores provider buttons for retry", async () => {
    mocks.start.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "strava-isolated-acceptance-required" } });
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "카카오로 계속하기" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다. 다시 시도해 주세요.");
    expect(button).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["네이버로 계속하기", "functions/failed-precondition", "strava-isolated-acceptance-required"],
    ["카카오로 계속하기", "functions/unavailable", "strava-isolated-acceptance-required"],
    ["카카오로 계속하기", "functions/failed-precondition", "unrelated-reason"],
  ])("keeps unrelated errors generic: %s / %s / %s", async (providerLabel, code, reason) => {
    mocks.start.mockRejectedValueOnce({ code, details: { reason } });
    render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: providerLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다. 다시 시도해 주세요.");
  });
});
