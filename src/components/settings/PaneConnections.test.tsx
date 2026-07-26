import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PaneConnections } from "./PaneConnections";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  disconnectStrava: vi.fn(),
  track: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { stravaConnected: true, autoUpload: false } }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: mocks.confirm }),
}));
vi.mock("../../hooks/useStrava", () => ({
  useStrava: () => ({
    connectStrava: vi.fn(),
    disconnectStrava: mocks.disconnectStrava,
    loading: false,
  }),
}));
vi.mock("../../services/analytics", () => ({ track: mocks.track }));

describe("PaneConnections Strava disconnect observability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.confirm.mockReset();
    mocks.disconnectStrava.mockReset();
    mocks.track.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("records intent and cancel without calling the backend", async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    const params = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      source: "web",
    };
    expect(mocks.track).toHaveBeenNthCalledWith(1, "strava_disconnect_intent", params);
    expect(mocks.track).toHaveBeenNthCalledWith(2, "strava_disconnect_cancel", params);
    expect(mocks.disconnectStrava).not.toHaveBeenCalled();
  });

  it("records confirmation and passes the same operation ID to the backend hook", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.disconnectStrava.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><PaneConnections /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    const params = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      source: "web",
    };
    expect(mocks.track).toHaveBeenNthCalledWith(1, "strava_disconnect_intent", params);
    expect(mocks.track).toHaveBeenNthCalledWith(2, "strava_disconnect_confirm", params);
    expect(mocks.disconnectStrava).toHaveBeenCalledWith(params.operationId);
  });
});
