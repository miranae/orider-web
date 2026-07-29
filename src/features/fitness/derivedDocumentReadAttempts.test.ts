import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import {
  invalidateDerivedDocumentReadAttempt,
  markDerivedDocumentReadAttempt,
  shouldReadDerivedDocument,
} from "./derivedDocumentReadAttempts";

function activity(summaryPatch: Record<string, unknown> = {}): Activity {
  return {
    id: "activity-1",
    userId: "user-1",
    type: "Ride",
    startTime: 1,
    summary: {
      distance: 10_000,
      ridingTimeMillis: 1_000,
      ...summaryPatch,
    },
  } as Activity;
}

describe("derivedDocumentReadAttempts", () => {
  it("records missing and present reads as one attempt for an unchanged activity", () => {
    const attempts = new Map<string, string>();
    const current = activity();

    expect(shouldReadDerivedDocument(attempts, current)).toBe(true);
    markDerivedDocumentReadAttempt(attempts, current);
    expect(shouldReadDerivedDocument(attempts, current)).toBe(false);
  });

  it("allows a later backend document after the activity lifecycle changes", () => {
    const attempts = new Map<string, string>();
    markDerivedDocumentReadAttempt(attempts, activity());

    expect(shouldReadDerivedDocument(attempts, activity({ movingTimeSec: 900 }))).toBe(true);
  });

  it("supports explicit invalidation after a transient read failure", () => {
    const attempts = new Map<string, string>();
    markDerivedDocumentReadAttempt(attempts, activity());
    invalidateDerivedDocumentReadAttempt(attempts, "activity-1");

    expect(shouldReadDerivedDocument(attempts, activity())).toBe(true);
  });
});
