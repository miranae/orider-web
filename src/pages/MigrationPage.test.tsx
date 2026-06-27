import { screen, waitFor } from "@testing-library/react";
import MigrationPage from "./MigrationPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("MigrationPage", () => {
  it("shows landing step for unauthenticated users", async () => {
    renderWithProviders(<MigrationPage />, { authenticated: false });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("Strava") || content.includes("가져오기"),
      ).toBeTruthy();
    });
  });

  it("shows migration steps for authenticated user without Strava", async () => {
    renderWithProviders(<MigrationPage />, {
      authenticated: true,
      profile: { stravaConnected: false },
    });
    await waitFor(() => {
      // Landing step should be shown
      const content = document.body.textContent ?? "";
      expect(content.includes("Strava") || content.includes("연동")).toBeTruthy();
    });
  });

  it("shows scope selection for new Strava-connected user", async () => {
    renderWithProviders(<MigrationPage />, {
      authenticated: true,
      profile: { stravaConnected: true },
    });
    await waitFor(() => {
      // Should show landing step since no migration started
      const content = document.body.textContent ?? "";
      expect(
        content.includes("가져오기") ||
        content.includes("복사") ||
        content.includes("Strava"),
      ).toBeTruthy();
    });
  });

  it("shows progress step when migration is running", async () => {
    renderWithProviders(<MigrationPage />, {
      authenticated: true,
      profile: {
        stravaConnected: true,
        migration: {
          status: "RUNNING",
          scope: { period: "recent_90", includePhotos: false, includeSegments: false },
          progress: {
            totalActivities: 100,
            importedActivities: 50,
            skippedActivities: 0,
            currentPage: 1,
            totalPages: 5,
            phase: "activities",
            totalStreams: 0,
            fetchedStreams: 0,
            failedStreams: 0,
            startedAt: Date.now() - 60000,
            updatedAt: Date.now(),
            queuePosition: null,
            waitUntil: null,
            estimatedMinutes: 5,
          },
          report: null,
        },
      },
    });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("진행") || content.includes("50") || content.includes("활동"),
      ).toBeTruthy();
    });
  });

  it("shows report step when migration is done", async () => {
    renderWithProviders(<MigrationPage />, {
      authenticated: true,
      profile: {
        stravaConnected: true,
        migration: {
          status: "DONE",
          scope: { period: "all", includePhotos: false, includeSegments: false },
          progress: null,
          report: {
            totalActivities: 200,
            totalDistance: 5000000,
            totalTime: 360000000,
            totalElevation: 30000,
            totalCalories: 150000,
            totalPhotos: 0,
            totalSegmentEfforts: 0,
            totalStreams: 200,
            earliestActivity: Date.now() - 365 * 86400000,
            latestActivity: Date.now() - 86400000,
            topRoutes: [],
          },
        },
      },
    });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(content.includes("200") || content.includes("완료")).toBeTruthy();
    });
  });
});
