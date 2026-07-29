import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import {
  invalidateDerivedDocumentReadAttempt,
  markDerivedDocumentMissing,
  markDerivedDocumentReadComplete,
  markDerivedDocumentReadFailed,
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
  it("caches a completed read for an unchanged activity", () => {
    const attempts = new Map();
    const current = activity();

    expect(shouldReadDerivedDocument(attempts, current)).toBe(true);
    markDerivedDocumentReadAttempt(attempts, current);
    markDerivedDocumentReadComplete(attempts, current);
    expect(shouldReadDerivedDocument(attempts, current)).toBe(false);
  });

  it("makes a missing read eligible only after its bounded backoff", () => {
    const attempts = new Map();
    const current = activity();
    markDerivedDocumentReadAttempt(attempts, current);
    markDerivedDocumentMissing(attempts, current, 2_000);

    expect(shouldReadDerivedDocument(attempts, current, 1_999)).toBe(false);
    expect(shouldReadDerivedDocument(attempts, current, 2_000)).toBe(true);
  });

  it("makes a failed read eligible only after its bounded recovery time", () => {
    const attempts = new Map();
    const current = activity();
    markDerivedDocumentReadAttempt(attempts, current);
    markDerivedDocumentReadFailed(attempts, current, 5_000);

    expect(shouldReadDerivedDocument(attempts, current, 4_999)).toBe(false);
    expect(shouldReadDerivedDocument(attempts, current, 5_000)).toBe(true);
  });

  it("allows a later backend document after the activity lifecycle changes", () => {
    const attempts = new Map();
    markDerivedDocumentReadAttempt(attempts, activity());

    expect(shouldReadDerivedDocument(attempts, activity({ movingTimeSec: 900 }))).toBe(true);
  });

  it("supports explicit invalidation after a transient read failure", () => {
    const attempts = new Map();
    markDerivedDocumentReadAttempt(attempts, activity());
    invalidateDerivedDocumentReadAttempt(attempts, "activity-1");

    expect(shouldReadDerivedDocument(attempts, activity())).toBe(true);
  });
});
