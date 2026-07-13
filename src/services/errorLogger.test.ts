import { captureError } from "./sentry";
import { mockCallableInvocations } from "../__tests__/mocks/firebase";
import { __resetClientErrorDedupeForTests, logClientError } from "./errorLogger";

vi.mock("./sentry", () => ({ captureError: vi.fn() }));

describe("logClientError", () => {
  beforeEach(() => {
    __resetClientErrorDedupeForTests();
    vi.mocked(captureError).mockClear();
  });

  it("sends an identical immediate error only once", () => {
    const error = new Error("INTERNAL ASSERTION FAILED: Unexpected state");

    for (let i = 0; i < 20; i += 1) {
      logClientError("useActivities.initialLoad.first", error, { attempt: i });
    }

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1);
  });

  it("does not merge different sources", () => {
    const error = new Error("same message");

    logClientError("source.a", error);
    logClientError("source.b", error);

    expect(captureError).toHaveBeenCalledTimes(2);
  });
});
