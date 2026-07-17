import { describe, expect, it, vi } from "vitest";
import { notifyCoachConsentSessionReset, subscribeCoachConsentSessionReset } from "./consentSessionBoundary";

describe("coach consent session boundary", () => {
  it("signals #550 to clear its own in-memory draft and answer state", () => {
    const reset = vi.fn();
    const unsubscribe = subscribeCoachConsentSessionReset(reset);
    notifyCoachConsentSessionReset();
    expect(reset).toHaveBeenCalledOnce();
    unsubscribe();
    notifyCoachConsentSessionReset();
    expect(reset).toHaveBeenCalledOnce();
  });
});
