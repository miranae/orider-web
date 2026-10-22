import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachConditionPage from "./CoachConditionPage";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
const state = vi.hoisted(() => ({ empty: false, mobile: false }));
vi.mock("./CoachFitnessLayout", () => ({ useCoachFitnessModel: () => state.mobile ? { isMobile: true, discipline: "run" } : state.empty ? { loading: false, activities: [], fitnessData: [], currentPoint: null } : { loading: true } }));
vi.mock("../FitnessPage", () => ({ FitnessView: ({ thresholdsSlot }: { thresholdsSlot: React.ReactNode }) => <><div>loading fitness</div>{thresholdsSlot}</> }));
vi.mock("../../components/settings/PaneThresholds", () => ({ PaneThresholds: () => <div>threshold form</div> }));
function SamePageLink() { const navigate = useNavigate(); return <button onClick={() => navigate("/coach/condition#thresholds")}>open anchor</button>; }
afterEach(cleanup);
describe("condition threshold lazy anchor", () => {
  it("renders the editable threshold form immediately and preserves same-page hash navigation", async () => {
    render(<MemoryRouter initialEntries={["/coach/condition"]}><SamePageLink /><CoachConditionPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("threshold form")).toBeVisible());
    fireEvent.click(screen.getByText("open anchor"));
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    const details = document.getElementById("thresholds")!;
    expect(details.tagName).toBe("SECTION");
    fireEvent.click(screen.getByText("open anchor"));
    await waitFor(() => expect(details).toBeVisible());
  });
  it("opens the threshold form for a loaded first-user empty state", async () => {
    state.empty = true;
    render(<MemoryRouter initialEntries={["/coach/condition"]}><CoachConditionPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    expect(document.getElementById("thresholds")).toHaveProperty("tagName", "SECTION");
    state.empty = false;
  });
  it("opens directly through the anchor while the fitness model is loading", async () => {
    render(<MemoryRouter initialEntries={["/coach/condition#thresholds"]}><CoachConditionPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    expect(document.getElementById("thresholds")).toHaveProperty("tagName", "SECTION");
  });
});

function CurrentLocation() { const l = useLocation(); return <p>{l.pathname}{l.search}{l.hash}</p>; }
it.each([
  ["#condition-metrics", "/ko/coach/analysis?sport=run#analysis-comparison"],
  ["#condition-ftp", "/ko/coach/analysis?sport=run#ftp-decision"],
  ["#thresholds", "/ko/settings/training?sport=run#thresholds"],
  ["&decisionId=decision-1", "/ko/coach/analysis?sport=run&decisionId=decision-1#ftp-decision"],
])("preserves the mobile destination, sport and decision for %s", async (suffix, destination) => {
  state.mobile = true;
  render(<MemoryRouter initialEntries={[`/ko/coach/condition?sport=run${suffix}`]}><CoachConditionPage /><CurrentLocation /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(destination)).toBeInTheDocument());
  expect(screen.queryByText("threshold form")).not.toBeInTheDocument();
  state.mobile = false;
});
