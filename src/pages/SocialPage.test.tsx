import { screen, waitFor } from "@testing-library/react";
import SocialPage from "./SocialPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("SocialPage", () => {
  it("shows add-friend routes and a clear share-code action when the friend list is empty", async () => {
    renderWithProviders(<SocialPage />, {
      authenticated: true,
      profile: { friendCode: "ABC123" },
    });

    await waitFor(() => {
      expect(screen.getByText("아직 친구가 없습니다")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("link", { name: /친구 추가하기/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /내 코드 공유/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대" })).not.toBeInTheDocument();
  });
});
