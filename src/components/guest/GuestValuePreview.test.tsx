import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockSignInWithPopup } from "../../__tests__/mocks/firebase";
import GuestValuePreview from "./GuestValuePreview";

describe("GuestValuePreview", () => {

  it("starts Google sign-in without sending the guest to settings", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GuestValuePreview kind="fitness" lang="ko" />, {
      authenticated: false,
      route: "/ko/fitness?period=6w",
    });

    await user.click(screen.getByRole("button", { name: "로그인하면 내 데이터로 보기" }));
    await user.click(await screen.findByTestId("A1-1-1"));
    expect(mockSignInWithPopup).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "로그인하면 내 데이터로 보기" })).not.toBeInTheDocument();
  });
});
