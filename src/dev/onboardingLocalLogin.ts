import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { firstWorkoutLocalAvailable } from "../features/training/start/firstWorkoutClient";

/** Public synthetic emulator credentials, fenced from real projects. */
export async function signInOnboardingReview(): Promise<void> {
  if (!firstWorkoutLocalAvailable() || auth.app.options.projectId !== "demo-orider-onboarding") throw new Error("local-review-only");
  await signInWithEmailAndPassword(auth, "beginner@onboarding.local", "LocalReviewOnly1400!");
  sessionStorage.setItem("orider.local-onboarding.signed-in", "yes");
}

export async function restoreOnboardingReview(): Promise<void> {
  if (firstWorkoutLocalAvailable() && sessionStorage.getItem("orider.local-onboarding.signed-in") === "yes") await signInOnboardingReview();
}
