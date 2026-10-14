import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachConditionPage from "./CoachConditionPage";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
const state = vi.hoisted(() => ({ empty: false }));
vi.mock("./CoachFitnessLayout", () => ({ useCoachFitnessModel: () => state.empty ? { loading: false, activities: [], fitnessData: [], currentPoint: null } : { loading: true } }));
vi.mock("../FitnessPage", () => ({ FitnessView: ({ thresholdsSlot }: { thresholdsSlot: React.ReactNode }) => <><div>loading fitness</div>{thresholdsSlot}</> }));
vi.mock("../../components/settings/PaneThresholds", () => ({ PaneThresholds: () => <div>threshold form</div> }));
function SamePageLink() { const navigate = useNavigate(); return <button onClick={() => navigate("/coach/condition#thresholds")}>open anchor</button>; }
afterEach(cleanup);
describe("condition threshold lazy anchor", () => {
  it("stays unmounted while collapsed then opens on same-page hash changes", async () => {
    render(<MemoryRouter initialEntries={["/coach/condition"]}><SamePageLink /><CoachConditionPage /></MemoryRouter>);
    expect(screen.queryByText("threshold form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("open anchor"));
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    const details = document.getElementById("thresholds") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    details.open = false;
    fireEvent.click(screen.getByText("open anchor"));
    await waitFor(() => expect(details.open).toBe(true));
  });
  it("opens the threshold form for a loaded first-user empty state", async () => {
    state.empty = true;
    render(<MemoryRouter initialEntries={["/coach/condition"]}><CoachConditionPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    expect((document.getElementById("thresholds") as HTMLDetailsElement).open).toBe(true);
    state.empty = false;
  });
  it("opens directly through the anchor while the fitness model is loading", async () => {
    render(<MemoryRouter initialEntries={["/coach/condition#thresholds"]}><CoachConditionPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("threshold form")).toBeInTheDocument());
    expect((document.getElementById("thresholds") as HTMLDetailsElement).open).toBe(true);
  });
});
