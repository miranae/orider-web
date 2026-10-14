import { screen, waitFor } from "@testing-library/react";
import { limit, orderBy } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setCollectionDocs } from "../../__tests__/mocks/firebase";
import ChallengeFeed from "./ChallengeFeed";
describe("popular course request bounds", () => {
  it("requests the four server-sorted popular courses and renders their navigation", async () => {
    vi.mocked(limit).mockClear(); vi.mocked(orderBy).mockClear();
    setCollectionDocs("courses", [{ id: "course", name: "Popular course", visibility: "public", distance: 1000, likeCount: 10 }]);
    renderWithProviders(<ChallengeFeed part="courses" />);
    expect(await screen.findByRole("link", { name: /Popular course/ })).toHaveAttribute("href", "/ko/course/course");
    await waitFor(() => expect(limit).toHaveBeenCalledWith(4));
    expect(orderBy).toHaveBeenCalledWith("likeCount", "desc");
  });
});
