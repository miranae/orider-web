import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockSignInWithPopup } from "../../__tests__/mocks/firebase";
import GuestValuePreview from "./GuestValuePreview";

describe("GuestValuePreview", () => {
  it.each(["fitness", "plan", "log"] as const)("uses a responsive demo grid for %s", (kind) => {
    renderWithProviders(<GuestValuePreview kind={kind} lang="ko" />, { authenticated: false });
    const firstLabel = kind === "fitness" ? "D-21" : kind === "plan" ? "Mon" : "03";
    expect(screen.getByText(firstLabel)).toBeInTheDocument();
    // jsdom의 CSSStyleDeclaration은 중첩 min()을 파싱하지 않으므로 소스 계약을 확인한다.
    const source = readFileSync(join(process.cwd(), "src/components/guest/GuestValuePreview.tsx"), "utf8");
    expect(source).toContain('repeat(auto-fit, minmax(min(100%, 120px), 1fr))');
    expect(source).toContain('repeat(auto-fit, minmax(min(100%, 80px), 1fr))');
  });

  it("starts Google sign-in without sending the guest to settings", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GuestValuePreview kind="fitness" lang="ko" />, {
      authenticated: false,
      route: "/ko/fitness?period=6w",
    });

    await user.click(screen.getByRole("button", { name: "로그인하면 내 데이터로 보기" }));
    expect(mockSignInWithPopup).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "로그인하면 내 데이터로 보기" })).not.toBeInTheDocument();
  });
});
