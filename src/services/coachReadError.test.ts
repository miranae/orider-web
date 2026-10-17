import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyCoachReadError, reportCoachReadError } from "./coachReadError";

const log = vi.hoisted(() => vi.fn());
vi.mock("./errorLogger", () => ({ logClientError: log }));

describe("Coach read error recovery", () => {
  beforeEach(() => log.mockClear());

  it.each([
    [new Error("app-check/token-timeout"), "verification"],
    [{ code: "appCheck/recaptcha-error", message: "private SDK details" }, "verification"],
    [{ code: "appCheck/fetch-network-error" }, "verification"],
    [{ code: "appCheck/fetch-status-error" }, "verification"],
    [{ code: "appCheck/fetch-parse-error" }, "verification"],
    [{ code: "appCheck/initial-throttle" }, "verificationWait"],
    [{ code: "appCheck/throttled" }, "verificationWait"],
    [{ code: "auth/network-request-failed" }, "transport"],
    [new Error("COACH_CONSENT_NETWORK_ERROR"), "transport"],
    [{ name: "CoachClientError", kind: "transport" }, "transport"],
    [{ name: "CoachHistoryTransportError" }, "transport"],
    [new Error("SIGN_IN_REQUIRED"), "auth"],
    [{ code: "auth/user-token-expired" }, "auth"],
    [new Error("HTTP_503"), "service"],
  ])("classifies known preflight and read failures: %j", (error, kind) => {
    expect(classifyCoachReadError(error).kind).toBe(kind);
  });

  it.each([undefined, null, new TypeError("Cannot read private payload"), new Error("INVALID_COACH_HISTORY_RESPONSE"), { kind: "transport" }, { code: "__proto__" }])(
    "keeps unrecognized errors generic instead of guessing a contract or network cause: %j", error => {
      expect(classifyCoachReadError(error)).toEqual({ kind: "unknown", code: "unknown" });
    },
  );

  it("logs only allowlisted classification, without original message, cause, token or payload", () => {
    const secret = "private-token-private-question";
    expect(reportCoachReadError("history-list", { code: "appCheck/recaptcha-error", message: secret, cause: { payload: secret } })).toBe("verification");
    expect(log).toHaveBeenCalledWith("Coach.read.history-list", expect.objectContaining({ message: "coach-read/verification" }), {
      operation: "history-list", kind: "verification", code: "appCheck/recaptcha-error",
    });
    const [, loggedError, context] = log.mock.calls[0];
    expect(loggedError).not.toHaveProperty("cause");
    expect(`${loggedError.message} ${JSON.stringify(context)}`).not.toContain(secret);
    reportCoachReadError("history-quota", new Error(secret));
    expect(log.mock.calls[1][2]).toEqual({ operation: "history-quota", kind: "unknown", code: "unknown" });
  });
});
