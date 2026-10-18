import { socialAuthErrorKey } from "./SocialAuthCallbackPage";

describe("socialAuthErrorKey", () => {
  it("maps server error codes to localized keys", () => {
    expect(socialAuthErrorKey("functions/already-exists")).toBe("socialCallback.error.alreadyLinked");
    expect(socialAuthErrorKey("functions/failed-precondition")).toBe("socialCallback.error.providerInUse");
    expect(socialAuthErrorKey("functions/not-found")).toBe("socialCallback.error.expired");
    expect(socialAuthErrorKey("functions/deadline-exceeded")).toBe("socialCallback.error.expired");
    expect(socialAuthErrorKey("functions/permission-denied")).toBe("socialCallback.error.denied");
    expect(socialAuthErrorKey(undefined)).toBe("socialCallback.error.generic");
  });
});
