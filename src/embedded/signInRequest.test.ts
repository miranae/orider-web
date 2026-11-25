import { describe, expect, it, vi } from "vitest";

import { serializeWebMessage } from "./bridge";
import {
  buildSignInRequestedPayload,
  HOST_SIGN_IN_REQUEST_CAPABILITY,
  requestEmbeddedSignIn,
  SIGN_IN_RETURN_PATH_MAX,
} from "./signInRequest";

describe("embedded sign-in request", () => {
  it("serializes auth.signInRequested with the surface and in-embed return path", () => {
    expect(JSON.parse(serializeWebMessage("auth.signInRequested", buildSignInRequestedPayload("explore", "/ko/embed/explore?tab=athletes"))))
      .toEqual({ version: 1, type: "auth.signInRequested", payload: { surface: "explore", returnPath: "/ko/embed/explore?tab=athletes" } });
  });

  it("drops a return path that is too long or not same-origin instead of truncating it", () => {
    expect(buildSignInRequestedPayload("clubs", `/${"a".repeat(SIGN_IN_RETURN_PATH_MAX)}`)).toEqual({ surface: "clubs" });
    expect(buildSignInRequestedPayload("clubs", "//evil.example/x")).toEqual({ surface: "clubs" });
    expect(buildSignInRequestedPayload("clubs", "https://evil.example/x")).toEqual({ surface: "clubs" });
    expect(buildSignInRequestedPayload("clubs", undefined)).toEqual({ surface: "clubs" });
  });

  it("only posts when the host advertised the capability", () => {
    const send = vi.fn();
    expect(requestEmbeddedSignIn({ hostCapabilities: [], surface: "clubs", send })).toBe("unsupported");
    expect(send).not.toHaveBeenCalled();
    expect(requestEmbeddedSignIn({ hostCapabilities: [HOST_SIGN_IN_REQUEST_CAPABILITY], surface: "clubs", returnPath: "/ko/embed/clubs", send }))
      .toBe("requested");
    expect(send).toHaveBeenCalledWith({ surface: "clubs", returnPath: "/ko/embed/clubs" });
  });

  it("reports an unavailable host when posting fails", () => {
    const send = vi.fn(() => { throw new Error("embedded-bridge/host-unavailable"); });
    expect(requestEmbeddedSignIn({ hostCapabilities: [HOST_SIGN_IN_REQUEST_CAPABILITY], surface: "explore", send })).toBe("unavailable");
  });

  it("hands the send failure to the caller for diagnostics", () => {
    const failure = new Error("embedded-bridge/host-unavailable");
    const onSendError = vi.fn();
    const outcome = requestEmbeddedSignIn({
      hostCapabilities: [HOST_SIGN_IN_REQUEST_CAPABILITY],
      surface: "explore",
      send: () => { throw failure; },
      onSendError,
    });
    expect(outcome).toBe("unavailable");
    expect(onSendError).toHaveBeenCalledWith(failure);
  });
});
