import { describe, expect, it } from "vitest";

import {
  ftpHistoryEntryWrite,
  ftpHistorySourceForChange,
  parseFtpHistoryEntry,
} from "@shared/training/ftpHistory";

describe("ftp history contract", () => {
  it("writes only the production rules-approved fields", () => {
    expect(ftpHistoryEntryWrite(265, "test", 1234)).toEqual({
      value: 265,
      source: "test",
      changedAt: 1234,
    });
  });

  it("accepts valid history and rejects malformed or unsupported records", () => {
    expect(parseFtpHistoryEntry("e1", { value: 265, source: "detected", changedAt: 1234 }))
      .toEqual({ id: "e1", value: 265, source: "detected", changedAt: 1234 });
    expect(parseFtpHistoryEntry("e2", { value: 265, source: "import", changedAt: 1234 })).toBeNull();
    expect(parseFtpHistoryEntry("e3", { value: 0, source: "manual", changedAt: 1234 })).toBeNull();
    expect(parseFtpHistoryEntry("e4", { value: 265, source: "manual", changedAt: Number.NaN })).toBeNull();
  });

  it("appends only actual FTP changes and preserves their source", () => {
    expect(ftpHistorySourceForChange(250, 265, "test")).toBe("test");
    expect(ftpHistorySourceForChange(250, 250, "manual")).toBeUndefined();
    expect(ftpHistorySourceForChange(250, null, "manual")).toBeUndefined();
  });

  it("does not append again when later settings work retries a committed FTP", () => {
    const committedBaseline = 265;

    expect(ftpHistorySourceForChange(committedBaseline, 265, "manual"))
      .toBeUndefined();
  });
});
