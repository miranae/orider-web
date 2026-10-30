import { useLocation } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Layout from "./Layout";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, mockCollectionData, getCurrentUser } from "../__tests__/mocks/firebase";
import { createMockNotification } from "../__tests__/fixtures/mockData";
vi.mock("../assets/icon.svg", () => ({ default: "/icon.svg" }));
vi.mock("../services/webNotifications", () => ({ createWebNotificationClient: () => ({
  list: async () => { await Promise.resolve(); return { items: mockCollectionData.get(`notifications/${getCurrentUser()?.uid}/items`) ?? [], nextCursor: null }; },
  markRead: async (ids: string[]) => ({ ids }),
}) }));
function NotificationRouteTrace() { const location = useLocation(); return <output data-testid="notification-route">{location.pathname}</output>; }

describe("friend acceptance notification navigation", () => {
  it.each([["sender-uid", "/ko/athlete/sender-uid"], ["../bad", "/ko/athlete/me/friends"]])("opens friend acceptance from the real notification UI with safe sender %s", async (fromUserId, destination) => {
    const user = userEvent.setup();
    renderWithProviders(<><Layout /><NotificationRouteTrace /></>, { authenticated: true, user: { uid: "uid-1" } });
    setCollectionDocs("notifications/uid-1/items", [{ ...createMockNotification({ type: "friend_accept", fromUserId, activityId: null, segmentId: null, message: "Friend accepted fixture", read: false }), id: "accepted" }]);
    await user.click((await screen.findAllByRole("button", { name: "알림" }))[0]!);
    await user.click(await screen.findByText("Friend accepted fixture"));
    await waitFor(() => expect(screen.getByTestId("notification-route")).toHaveTextContent(destination));
  });
});
