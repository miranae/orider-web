import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachConditionPage from "./CoachConditionPage";

const state = vi.hoisted(() => ({ mobile: false, discipline: "bike", loading: false }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner", isAnonymous: false } }) }));
vi.mock("./CoachFitnessModelContext", () => ({ useCoachFitnessModel: () => ({
  isMobile: state.mobile, discipline: state.discipline, loading: state.loading,
  activities: [], fitnessData: [], currentPoint: null,
}) }));
vi.mock("../FitnessPage", () => ({ FitnessView: ({ hasThresholdSettings }: { hasThresholdSettings: boolean }) =>
  <section aria-label="Current condition">Condition content{hasThresholdSettings && <button>Edit thresholds inline</button>}</section> }));
vi.mock("../../components/dashboard/CrossDisciplineLoadCard", () => ({ default: () => <div>Cross-sport load</div> }));

function CurrentLocation() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate("/ko/coach/condition?sport=run&from=goal#thresholds")}>Open old settings link</button></>;
}
function Fixture({ entry, previous }: { entry: string; previous?: string }) {
  return <MemoryRouter initialEntries={previous ? [previous, entry] : [entry]} initialIndex={previous ? 1 : 0}>
    <CurrentLocation />
    <Routes>
      <Route path="/:lang/coach/condition" element={<CoachConditionPage />} />
      <Route path="/:lang/coach/analysis" element={<section>Analysis destination</section>} />
      <Route path="/:lang/settings/training" element={<section>Training settings destination</section>} />
      <Route path="/:lang/start" element={<section>Previous page</section>} />
    </Routes>
  </MemoryRouter>;
}
afterEach(() => { cleanup(); state.mobile = false; state.discipline = "bike"; state.loading = false; });

describe("condition legacy destinations", () => {
  it.each([
    { mobile: false, discipline: "run", entry: "/en/coach/condition?sport=run&from=goal#thresholds", destination: "/en/settings/training?sport=run&from=goal#thresholds" },
    { mobile: true, discipline: "bike", entry: "/ko/coach/condition?sport=bike&from=analysis#thresholds", destination: "/ko/settings/training?sport=bike&from=analysis#thresholds" },
    { mobile: false, discipline: "bike", entry: "/ko/coach/condition?sport=bike&range=180#condition-metrics", destination: "/ko/coach/analysis?sport=bike&range=180#analysis-comparison" },
    { mobile: true, discipline: "run", entry: "/ko/coach/condition?sport=run&range=90#condition-metrics", destination: "/ko/coach/analysis?sport=run&range=90#analysis-comparison" },
    { mobile: false, discipline: "bike", entry: "/ko/coach/condition?sport=bike&decisionId=decision-1#condition-ftp", destination: "/ko/coach/analysis?sport=bike&decisionId=decision-1#ftp-decision" },
    { mobile: true, discipline: "run", entry: "/en/coach/condition?sport=run#ftp-decision", destination: "/en/coach/analysis?sport=run#ftp-decision" },
    { mobile: false, discipline: "bike", entry: "/ko/coach/condition?sport=bike&decisionId=decision-2", destination: "/ko/coach/analysis?sport=bike&decisionId=decision-2#ftp-decision" },
  ])("preserves locale and query for $entry on mobile=$mobile", async ({ mobile, discipline, entry, destination }) => {
    Object.assign(state, { mobile, discipline, loading: true });
    render(<Fixture entry={entry} />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(destination));
    expect(screen.queryByRole("region", { name: "Current condition" })).not.toBeInTheDocument();
  });

  it("replaces an old destination so back returns to the preceding page", async () => {
    render(<Fixture previous="/ko/start" entry="/ko/coach/condition?sport=bike#condition-ftp" />);
    await screen.findByText("Analysis destination");
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await screen.findByText("Previous page");
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/start");
  });

  it("also routes a same-page old settings link to the dedicated settings screen", async () => {
    state.discipline = "run";
    render(<Fixture entry="/ko/coach/condition?sport=run" />);
    expect(screen.getByRole("region", { name: "Current condition" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open old settings link" }));
    await screen.findByText("Training settings destination");
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/settings/training?sport=run&from=goal#thresholds");
  });

  it.each([true, false])("keeps the ordinary condition readable without an inline settings editor while loading=%s", loading => {
    state.loading = loading;
    render(<Fixture entry="/ko/coach/condition?sport=bike#condition-trend" />);
    expect(screen.getByRole("region", { name: "Current condition" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit thresholds inline" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/coach/condition?sport=bike#condition-trend");
  });

  it("retains the integrated condition metrics destination instead of sending it to single-sport analysis", () => {
    state.mobile = true; state.discipline = "tri";
    render(<Fixture entry="/ko/coach/condition?sport=tri#condition-metrics" />);
    expect(screen.getByRole("region", { name: "Current condition" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/coach/condition?sport=tri#condition-metrics");
  });
});
