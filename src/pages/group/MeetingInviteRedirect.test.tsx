import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { expect, it } from "vitest";
import MeetingInviteRedirect from "./MeetingInviteRedirect";
function Target() { const p = useParams(); return <p>{p.lang}/{p.groupId}/{p.meetingId}</p>; }
it("opens the canonical meeting route from the compact invitation", async () => {
  render(<MemoryRouter initialEntries={["/en/m/club/event"]}><Routes><Route path="/:lang/m/:groupId/:meetingId" element={<MeetingInviteRedirect />} /><Route path="/:lang/club/:groupId/meetings/:meetingId" element={<Target />} /></Routes></MemoryRouter>);
  expect(await screen.findByText("en/club/event")).toBeInTheDocument();
});
