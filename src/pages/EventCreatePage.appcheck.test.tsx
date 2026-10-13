import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { httpsCallable } from "firebase/functions";
import { getAppCheckToken } from "../services/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, simulateLogin } from "../__tests__/mocks/firebase";
import EventCreatePage from "./EventCreatePage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function draft() {
  const view = renderWithProviders(<EventCreatePage />, { authenticated: true, route: "/ko/event/create" });
  fireEvent.change(await screen.findByPlaceholderText("남한강 그란폰도 2026"), { target: { value: "QA 초안" } });
  return view;
}

const createCalls = () => mockCallableInvocations.filter((call) => call.name === "createEvent");
const constructedCreates = () => vi.mocked(httpsCallable).mock.calls.filter((call) => call[1] === "createEvent");

describe("EventCreatePage cold App Check admission", () => {
  beforeEach(() => {
    vi.mocked(httpsCallable).mockClear();
    vi.mocked(getAppCheckToken).mockResolvedValue("test-app-check-token");
    setCallableResult("createEvent", { data: { eventId: "event-draft" } });
  });

  it("waits for the bundled App Check token before constructing the first callable and suppresses duplicate clicks", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    await draft();
    const button = screen.getByRole("button", { name: "임시 저장" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(constructedCreates()).toHaveLength(0);
    expect(createCalls()).toHaveLength(0);
    await act(async () => { ready.resolve("cold-token"); });
    await waitFor(() => expect(createCalls()).toHaveLength(1));
    expect(constructedCreates()).toHaveLength(1);
    expect(createCalls()[0].data).toMatchObject({ name: "QA 초안", isDraft: true, feeType: "FREE" });
  });

  it("does not construct or write when App Check returns an empty token", async () => {
    vi.mocked(getAppCheckToken).mockResolvedValueOnce(null);
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await screen.findByText("app-check/empty-token");
    expect(constructedCreates()).toHaveLength(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("preserves token rejection and allows a fresh normal retry without a failed write", async () => {
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await screen.findByText("app-check/token-timeout");
    expect(createCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await waitFor(() => expect(createCalls()).toHaveLength(1));
  });

  it("rejects an old preparation after an account changes away and returns to the same UID", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await act(async () => {
      simulateLogin({ uid: "other-uid" });
      simulateLogin({ uid: "test-uid" });
    });
    await act(async () => { ready.resolve("old-generation-token"); });
    expect(constructedCreates()).toHaveLength(0);
    expect(createCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await waitFor(() => expect(createCalls()).toHaveLength(1));
  });

  it("does not construct a callable after unmount during token preparation", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    const view = await draft();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    view.unmount();
    await act(async () => { ready.resolve("late-token"); });
    expect(constructedCreates()).toHaveLength(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("keeps the original callable error and does not automatically retry a rejected write", async () => {
    setCallableImplementation("createEvent", () => { throw new Error("original functions permission-denied"); });
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await screen.findByText("original functions permission-denied");
    expect(createCalls()).toHaveLength(1);
  });
});
