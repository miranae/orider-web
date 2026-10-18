import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CoachSignInButton from "./CoachSignInButton";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), toast: vi.fn() }));
vi.mock("../../contexts/AuthContext", async importOriginal => ({ ...await importOriginal<typeof import("../../contexts/AuthContext")>(), useAuth: () => ({ signIn: mocks.signIn }) }));
vi.mock("../../contexts/ToastContext", async importOriginal => ({ ...await importOriginal<typeof import("../../contexts/ToastContext")>(), useToast: () => ({ showToast: mocks.toast }) }));
describe("coach guest sign in", () => {
  it("disables repeated requests and reports rejected sign in then permits retry", async () => {
    let reject!: (error: Error) => void;
    mocks.signIn.mockReturnValueOnce(new Promise<void>((_, rejectPromise) => { reject = rejectPromise; }));
    renderWithProviders(<CoachSignInButton />);
    const button = screen.getByRole("button", { name: "기록을 저장하려면 로그인" });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("auth failed")); });
    expect(mocks.toast).toHaveBeenCalledWith("로그인에 실패했습니다. 다시 시도해 주세요.", "error");
    expect(button).toBeEnabled();
  });
});
