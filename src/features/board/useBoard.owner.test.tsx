import { screen, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { useBoardPosts } from "./useBoard";
function OwnerPosts() {
  const { loading } = useBoardPosts("archive", 20, "AI", "search", ["AI"], 1, true);
  return <span>{loading ? "loading" : "ready"}</span>;
}
describe("owner board pagination", () => {
  beforeEach(() => { vi.mocked(where).mockClear(); vi.mocked(getDocs).mockClear(); vi.mocked(httpsCallable).mockClear(); });
  it("constrains server reads to owner and undeleted posts and ignores public filters", async () => {
    renderWithProviders(<OwnerPosts />, { authenticated: true });
    await screen.findByText("ready");
    expect(where).toHaveBeenCalledWith("userId", "==", "test-uid");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(where).not.toHaveBeenCalledWith("isPrivate", "==", false);
    expect(where).not.toHaveBeenCalledWith("boardType", "==", "archive");
    expect(where).not.toHaveBeenCalledWith("tags", "array-contains", "AI");
    expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "searchBoardPosts");
  });
  it("does not query an entire board for signed-out owner view", async () => {
    renderWithProviders(<OwnerPosts />, { authenticated: false });
    await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
    expect(getDocs).not.toHaveBeenCalled();
  });
});
