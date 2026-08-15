import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { listSessionExecutions } from "./trainingExecutionClient";

const mocks = vi.hoisted(() => ({ callable: vi.fn(), functions: { app: "functions" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("./firebase", () => ({ functions: mocks.functions }));

describe("training execution callable client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callable.mockResolvedValue({ data: { executions: [] } });
  });

  it("sends the backend exact discipline-scoped list request", async () => {
    await expect(listSessionExecutions("run")).resolves.toEqual([]);
    expect(httpsCallable).toHaveBeenCalledWith(mocks.functions, "listSessionExecutions");
    expect(mocks.callable).toHaveBeenCalledWith({ discipline: "run", limit: 20 });
  });
});
