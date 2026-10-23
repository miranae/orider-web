import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import CoachFitnessLayout, { useCoachFitnessModel } from "./CoachFitnessLayout";
const mocks = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn(), sport: vi.fn() }));
vi.mock("../../hooks/useFitnessModel", () => ({ useFitnessModel: (sport: string) => {
  mocks.sport(sport);
  useEffect(() => { mocks.mount(); return () => { mocks.unmount(); }; }, []);
  return { discipline: sport ?? "bike" };
} }));
function Probe() {
  const model = useCoachFitnessModel();
  const location = useLocation();
  return <><span>{model.discipline} {location.search}{location.hash}</span><Link to="/coach/analysis?sport=run">Analysis</Link></>;
}
function mount(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route element={<CoachFitnessLayout />}>
    <Route path="/coach/condition" element={<Probe />} /><Route path="/coach/today" element={<Probe />} /><Route path="/coach/analysis" element={<Probe />} />
  </Route></Routes></MemoryRouter>);
}
describe("coach shared fitness layout", () => {
  it("keeps one model subscription mounted across coach screens", async () => {
    mocks.mount.mockClear(); mocks.unmount.mockClear();
    mount("/coach/condition?sport=run");
    await userEvent.click(screen.getByRole("link", { name: "Analysis" }));
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(mocks.unmount).not.toHaveBeenCalled();
  });
  it("normalizes tri today without losing unrelated query or hash", () => {
    mount("/coach/today?sport=tri&decisionId=keep#execution");
    expect(screen.getByText("bike ?sport=bike&decisionId=keep#execution")).toBeInTheDocument();
  });
});

it.each(["all", "unknown", "swim"])("normalizes unsupported coach sport %s while preserving context", sport => {
  mount(`/coach/condition?sport=${sport}&date=2026-09-03#condition-trend`);
  expect(screen.getByText("bike ?sport=bike&date=2026-09-03#condition-trend")).toBeInTheDocument();
});
it("preserves tri integrated condition and its model", () => {
  mount("/coach/condition?sport=tri");
  expect(screen.getByText("tri ?sport=tri")).toBeInTheDocument();
});
it("uses bike consistently for an unspecified coach sport", () => {
  mount("/coach/analysis");
  expect(screen.getByText("bike")).toBeInTheDocument();
  expect(mocks.sport).toHaveBeenLastCalledWith("bike");
});
