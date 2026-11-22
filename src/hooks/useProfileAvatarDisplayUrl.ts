import { useSyncExternalStore } from "react";
import { isCanonicalProfileAvatarUrl } from "@shared/profileAvatar";
import { logClientError } from "../services/errorLogger";
import { isEmulatorRuntime } from "../services/runtimeConfig";

const listeners = new Set<() => void>();
const generations = new Map<string, string>();
const serverGeneration = () => undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshProfileAvatar(url: string, generation: string) {
  generations.set(url, generation);
  for (const listener of listeners) listener();
}

/** Refresh the edited avatar in this browser without changing its stored URL. */
export function useProfileAvatarDisplayUrl(url?: string | null) {
  const generation = useSyncExternalStore(subscribe, () => url ? generations.get(url) : undefined, serverGeneration);
  let displayUrl = url;
  const publicEndpoint = "https://firebasestorage.googleapis.com";
  if (url && isCanonicalProfileAvatarUrl(url) && isEmulatorRuntime()) {
    displayUrl = `http://localhost:${import.meta.env.VITE_STORAGE_EMULATOR_PORT || "9199"}${url.slice(publicEndpoint.length)}`;
  }
  return displayUrl && generation ? `${displayUrl}&v=${encodeURIComponent(generation)}` : displayUrl;
}

export function reportProfileAvatarLoadError(url?: string | null) {
  if (isCanonicalProfileAvatarUrl(url)) {
    logClientError("ProfileAvatar.image", new Error("Profile avatar image failed to load"), { stage: "load_image" });
  }
}
