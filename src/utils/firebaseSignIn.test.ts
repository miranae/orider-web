import { describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { auth } from "../services/firebase";
import { simulateLogin, simulateTokenChange } from "../__tests__/mocks/firebase";
import { observeFirebaseSignIn } from "./firebaseSignIn";

describe("observeFirebaseSignIn with the standard SDK mock", () => {
  it("gives each auth observer the same user object as its own currentUser", () => {
    simulateLogin();
    const webChange = vi.fn();
    const embeddedChange = vi.fn();
    const embedded = { currentUser: { uid: "embed" } } as Auth;
    const stopWeb = observeFirebaseSignIn(auth, webChange);
    const stopEmbed = observeFirebaseSignIn(embedded, embeddedChange);

    expect(webChange).not.toHaveBeenCalled();
    expect(embeddedChange).not.toHaveBeenCalled();
    simulateLogin({ uid: "web-next" });
    expect(webChange).toHaveBeenCalledOnce();
    expect(embeddedChange).not.toHaveBeenCalled();

    embedded.currentUser = { ...embedded.currentUser!, metadata: { lastSignInTime: "updated" } };
    simulateTokenChange(embedded);
    expect(embeddedChange).toHaveBeenCalledOnce();
    expect(webChange).toHaveBeenCalledOnce();
    stopWeb();
    stopEmbed();
  });
});
