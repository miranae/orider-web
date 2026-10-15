import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CourseSegmentSearch from "./CourseSegmentSearch";
afterEach(() => { vi.unstubAllGlobals(); });
describe("CourseSegmentSearch network recovery", () => {
  it("surfaces a failed network request and retries the existing static endpoint", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({
      ok: true, headers: { get: () => "application/json" },
      json: async () => ({ segments: [{ id: "segment-1", name: "Seoul climb", distance: 1000, averageGrade: 3 }] }),
    });
    vi.stubGlobal("fetch", fetch);
    renderWithProviders(<CourseSegmentSearch query="Seoul" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("세그먼트를 불러오지 못했어요");
    expect(screen.queryByText("Seoul climb · 1.0 km · 3.0%")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByText("Seoul climb · 1.0 km · 3.0%")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual(fetch.mock.calls[0]);
  });
});
