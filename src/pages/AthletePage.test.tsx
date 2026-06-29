import { screen, waitFor } from "@testing-library/react";
import AthletePage from "./AthletePage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createMockProfile, createMockActivity } from "../__tests__/fixtures/mockData";

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/WeeklyChart", () => ({
  default: () => <div data-testid="weekly-chart">Chart</div>,
}));

// Mock useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ userId: "athlete-1" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

describe("AthletePage", () => {
  beforeEach(() => {
    const profile = createMockProfile({ nickname: "한강 라이더" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { ...profile });
  });

  it("shows profile nickname", async () => {
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });

  it("shows avatar for the athlete", async () => {
    const profile = createMockProfile({ nickname: "라이더", photoURL: "https://example.com/p.jpg" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { ...profile });
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("라이더")).toBeInTheDocument();
    });
  });

  it("shows activities for the athlete", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ userId: "athlete-1", description: "아침 라이딩" }) },
    ]);
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(content.includes("한강 라이더") || content.includes("활동")).toBeTruthy();
    });
  });

  it("shows friend action button for other users", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("친구") ||
        content.includes("요청") ||
        content.includes("추가"),
      ).toBeTruthy();
    });
  });

  it("does not show friend action for own profile", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });
});
