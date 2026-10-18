import { currentReturnTo, socialRedirectUri, SOCIAL_CALLBACK_PATH } from "./socialAuth";

describe("socialAuth helpers", () => {
  afterEach(() => { window.history.replaceState(null, "", "/"); });

  it("strips the language prefix so the callback can re-apply the current language", () => {
    window.history.replaceState(null, "", "/ko/activity/abc?tab=analysis#laps");
    expect(currentReturnTo()).toBe("/activity/abc?tab=analysis#laps");
    window.history.replaceState(null, "", "/en");
    expect(currentReturnTo()).toBe("/");
    window.history.replaceState(null, "", "/korea-ride");
    expect(currentReturnTo()).toBe("/korea-ride");
  });

  it("uses a language-free callback path on the current origin", () => {
    expect(socialRedirectUri()).toBe(`${window.location.origin}${SOCIAL_CALLBACK_PATH}`);
    expect(SOCIAL_CALLBACK_PATH).toBe("/auth/social/callback");
  });
});
