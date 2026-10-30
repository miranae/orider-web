import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import NextEventContinuation from "./NextEventContinuation";

it.each(["ko", "en"])("preserves %s while continuing to the group event list", async lang => {
  render(<MemoryRouter initialEntries={[`/${lang}/preview`]}><Routes>
    <Route path="/:lang/preview" element={<NextEventContinuation groupId="g1" />} />
    <Route path="/:lang/club/g1/events" element={<div data-testid="paginated-event-list" />} />
  </Routes></MemoryRouter>);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", `/${lang}/club/g1/events`);
  await userEvent.click(link);
  expect(screen.getByTestId("paginated-event-list")).toBeInTheDocument();
});
