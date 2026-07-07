import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordRouteVisit } from "../services/routeLoopTelemetry";
import { useRouteVisitTelemetry } from "./useRouteVisitTelemetry";

vi.mock("../services/routeLoopTelemetry", () => ({
  recordRouteVisit: vi.fn(),
}));

function Probe() {
  const navigate = useNavigate();
  useRouteVisitTelemetry();
  return (
    <button type="button" onClick={() => navigate("/ko/settings")}>
      go
    </button>
  );
}

describe("useRouteVisitTelemetry", () => {
  beforeEach(() => {
    vi.mocked(recordRouteVisit).mockReset();
  });

  it("records the current route and then includes the previous pathname after navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/ko/activity/a1"]}>
        <Routes>
          <Route path="/:lang/*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(recordRouteVisit).toHaveBeenCalledWith({
        path: "/ko/activity/a1",
        fromPath: null,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    await waitFor(() => {
      expect(recordRouteVisit).toHaveBeenLastCalledWith({
        path: "/ko/settings",
        fromPath: "/ko/activity/a1",
      });
    });
  });
});
