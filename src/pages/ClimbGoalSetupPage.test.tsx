import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ClimbGoalSetupPage from "./ClimbGoalSetupPage";

const mocks = vi.hoisted(() => ({ auth: { user: null as null | { isAnonymous: boolean }, loading: true }, signIn: vi.fn(), callable: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ ...mocks.auth, signIn: mocks.signIn }) }));
vi.mock("../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock("../services/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
vi.mock("../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
beforeEach(() => { vi.clearAllMocks(); mocks.auth = { user: null, loading: true }; });
const view = () => render(<MemoryRouter><ClimbGoalSetupPage /></MemoryRouter>);
describe("ClimbGoalSetupPage authentication readiness", () => {
  it("shows the form for a known signed-in user while optional profile work is loading", () => {
    mocks.auth.user = { isAnonymous: false };
    view();
    expect(screen.getByRole("textbox", { name: "climbGoal.name" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "climbGoal.duration" })).toHaveValue(20);
    expect(screen.queryByText("climbGoal.loading")).not.toBeInTheDocument();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
  it("keeps the authentication wait state until a user is known", () => {
    view();
    expect(screen.getByText("climbGoal.loading")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
  it("requires sign-in for an anonymous user even during optional loading", () => {
    mocks.auth.user = { isAnonymous: true };
    view();
    expect(screen.getByRole("button", { name: "climbGoal.loginAction" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
