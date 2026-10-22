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

describe("social sign-in choices", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    resetRuntimeConfigForTests({ appEnvironment: "production" });
  });
  afterEach(() => { resetRuntimeConfigForTests({}); });

  it("shows all providers and starts the existing Google flow", () => {
    const google = vi.fn().mockResolvedValue(undefined);
    const button = showDialog(google);
    for (const name of ["네이버로 계속하기", "카카오로 계속하기", "Strava로 계속하기"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    for (const id of ["A1-1-2", "A1-1-3", "A1-1-4"]) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(google).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([undefined, "production", "stage", "development", "test"])("shows all providers regardless of runtime environment: %s", appEnvironment => {
    resetRuntimeConfigForTests({ appEnvironment });
    showDialog();
    for (const name of ["Google로 계속하기", "네이버로 계속하기", "카카오로 계속하기", "Strava로 계속하기"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });

  it.each([
    ["naver", "네이버로 계속하기"],
    ["kakao", "카카오로 계속하기"],
    ["strava", "Strava로 계속하기"],
  ])("starts the existing %s login and prevents concurrent provider requests", (provider, name) => {
    mocks.start.mockImplementation(() => new Promise<void>(() => {}));
    showDialog();
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith(provider, "login");
    for (const id of ["A1-1-1", "A1-1-2", "A1-1-3", "A1-1-4"]) expect(screen.getByTestId(id)).toBeDisabled();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it.each([
    ["naver", "네이버로 계속하기"],
    ["kakao", "카카오로 계속하기"],
    ["strava", "Strava로 계속하기"],
  ])("restores %s login after a failure and permits retry", async (provider, name) => {
    mocks.start.mockRejectedValueOnce(new Error("unavailable")).mockImplementationOnce(() => new Promise<void>(() => {}));
    showDialog();
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다");
    for (const id of ["A1-1-1", "A1-1-2", "A1-1-3", "A1-1-4"]) expect(screen.getByTestId(id)).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenNthCalledWith(2, provider, "login");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    for (const id of ["A1-1-2", "A1-1-3", "A1-1-4"]) expect(screen.getByTestId(id)).toBeDisabled();
    fireEvent.click(button);
    expect(google).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
