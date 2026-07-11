import { beforeEach, describe, expect, it } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../../../__tests__/mocks/firebase";
import { cancelEventRegistration } from "./cancelRegistration";

describe("cancelEventRegistration", () => {
  beforeEach(() => { mockCallableInvocations.length = 0; });

  it("accepts the deployed success response and invokes the transaction once", async () => {
    setCallableResult("cancelRegistration", { data: { success: true } });
    await cancelEventRegistration("event-1");
    expect(mockCallableInvocations).toEqual([{ name: "cancelRegistration", data: { eventId: "event-1" } }]);
  });

  it("does not report success for an invalid response", async () => {
    setCallableResult("cancelRegistration", { data: { success: false } });
    await expect(cancelEventRegistration("event-1")).rejects.toThrow("cancel-registration-failed");
  });
});
