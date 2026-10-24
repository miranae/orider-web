import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import NextEventContinuation from "./NextEventContinuation";

it("takes an incomplete preview to the group's explicit paginated event list", async () => {
  render(<MemoryRouter><Routes>
    <Route path="/" element={<NextEventContinuation groupId="g1" />} />
    <Route path="/club/g1/events" element={<div data-testid="paginated-event-list" />} />
  </Routes></MemoryRouter>);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", "/club/g1/events");
  await userEvent.click(link);
  expect(screen.getByTestId("paginated-event-list")).toBeInTheDocument();
});
