import { auth } from "../../../services/firebase";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import { isFirstWorkout, type FirstWorkout, type StartSport } from "./firstWorkout";

export function firstWorkoutLocalAvailable(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_FIRST_WORKOUT_LOCAL_PREVIEW === "true"
    && ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)
    && getRuntimeConfig().useEmulators === true
    && getRuntimeConfig().firebaseProjectId === "demo-orider-onboarding";
}

export async function firstWorkoutRequest(sport: StartSport, body?: Record<string, unknown>): Promise<FirstWorkout | null> {
  if (!firstWorkoutLocalAvailable()) throw new Error("unavailable");
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("unauthenticated");
  const response = await fetch(`/__local/first-workout?sport=${sport}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (auth.currentUser?.uid !== user.uid) throw new Error("session-changed");
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "request-failed");
  if (result.workout !== null && !isFirstWorkout(result.workout)) throw new Error("invalid-response");
  return result.workout;
}
