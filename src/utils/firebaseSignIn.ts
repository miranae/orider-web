import { onIdTokenChanged, type Auth } from "firebase/auth";

/** Token refreshes preserve the current sign-in and any UI state it owns. */
export function observeFirebaseSignIn(auth: Auth, onChange: () => void): () => void {
  let viewer = auth.currentUser;
  let signedInAt = viewer?.metadata?.lastSignInTime;
  return onIdTokenChanged(auth, next => {
    const nextSignIn = next?.metadata?.lastSignInTime;
    if (next === viewer && nextSignIn === signedInAt) return;
    viewer = next;
    signedInAt = nextSignIn;
    onChange();
  });
}
