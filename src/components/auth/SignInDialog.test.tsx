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
    expect(screen.getByText(/공개 프로필 읽기 권한만 요청/)).toBeInTheDocument();
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
