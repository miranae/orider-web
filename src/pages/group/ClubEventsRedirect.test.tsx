import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ClubEventsRedirect from "./ClubEventsRedirect";
function Target() { const l = useLocation(); return <p>{l.pathname}{l.search}{l.hash}</p>; }
describe("old events links", () => {
  it.each(["/ko/club/one", "/en/club/one", "/ko/embed/clubs/one", "/en/embed/clubs/one"])("returns to %s preserving filters and anchor", base => {
    render(<MemoryRouter initialEntries={[`${base}/events?sport=bike#schedule`]}><Routes><Route path={base.includes("embed") ? "/:lang/embed/clubs/:groupId/events" : "/:lang/club/:groupId/events"} element={<ClubEventsRedirect />} /><Route path={base.includes("embed") ? "/:lang/embed/clubs/:groupId" : "/:lang/club/:groupId"} element={<Target />} /></Routes></MemoryRouter>);
    expect(screen.getByText(`${base}?sport=bike#schedule`)).toBeInTheDocument();
  });
});
