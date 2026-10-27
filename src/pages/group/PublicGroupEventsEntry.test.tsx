import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import PublicGroupEventsEntry from "./PublicGroupEventsEntry";

vi.mock("../../components/group/PublicClubPreview", () => ({ default: ({ groupId }: { groupId: string }) => <div>Public schedule: {groupId}</div> }));
vi.mock("./GroupEventsPage", () => ({ default: () => <div>Member events</div> }));

describe("public LARA event entry", () => {
  it("opens the public preview directly for an anonymous visitor", async () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/events" element={<PublicGroupEventsEntry />} /></Routes>, { route: "/ko/club/club-lara/events" });
    expect(await screen.findByText("Public schedule: club-lara")).toBeInTheDocument();
    expect(screen.queryByText("Member events")).not.toBeInTheDocument();
  });
  it("keeps the member event page for authenticated visitors", async () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/events" element={<PublicGroupEventsEntry />} /></Routes>, { route: "/ko/club/club-lara/events", authenticated: true });
    expect(await screen.findByText("Member events")).toBeInTheDocument();
  });
});
