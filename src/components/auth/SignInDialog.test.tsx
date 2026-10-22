import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../../services/socialAuth", () => ({ startSocialAuth: mocks.start }));
import { SignInDialog } from "./SignInDialog";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

const showDialog = (onGoogle = vi.fn().mockResolvedValue(undefined)) => {
  render(<MemoryRouter><SignInDialog open onClose={vi.fn()} onGoogle={onGoogle} /></MemoryRouter>);
  return screen.getByRole("button", { name: "Google로 계속하기" });
};

describe("production sign-in choices", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    resetRuntimeConfigForTests({ appEnvironment: "production" });
  });
  afterEach(() => { resetRuntimeConfigForTests({}); });

  it("keeps Google as the only sign-in choice and starts its existing flow", () => {
    const google = vi.fn().mockResolvedValue(undefined);
    const button = showDialog(google);
    for (const name of ["네이버로 계속하기", "카카오로 계속하기", "Strava로 계속하기"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    for (const id of ["A1-1-2", "A1-1-3", "A1-1-4"]) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(google).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([undefined, "production", "development", "test"])("keeps Strava hidden outside stage: %s", appEnvironment => {
    resetRuntimeConfigForTests({ appEnvironment });
    showDialog();
    expect(screen.queryByRole("button", { name: "Strava로 계속하기" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("A1-1-4")).not.toBeInTheDocument();
  });

  it("shows only Google and Strava in stage and starts the existing Strava login flow", () => {
    resetRuntimeConfigForTests({ appEnvironment: "stage" });
    mocks.start.mockImplementation(() => new Promise<void>(() => {}));
    const google = showDialog();
    const strava = screen.getByRole("button", { name: "Strava로 계속하기" });
    expect(google).toBeVisible();
    expect(strava).toBeVisible();
    for (const id of ["A1-1-2", "A1-1-3"]) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    fireEvent.click(strava);
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith("strava", "login");
    expect(google).toBeDisabled();
    expect(strava).toBeDisabled();
  });

  it("restores Google sign-in after a failure and permits retry", async () => {
    const google = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(undefined);
    const button = showDialog(google);
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다");
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(google).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request"])("keeps a cancelled Google popup quiet: %s", async code => {
    const button = showDialog(vi.fn().mockRejectedValue({ code }));
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prevents duplicate Google requests while the popup is pending", async () => {
    let finish!: () => void;
    const google = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const button = showDialog(google);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(google).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
