import { useSyncExternalStore } from "react";
import { isCanonicalProfileAvatarUrl } from "@shared/profileAvatar";
import { logClientError } from "../services/errorLogger";
import { isEmulatorRuntime } from "../services/runtimeConfig";

const cacheWindowMs = 300_000;
const listeners = new Set<() => void>();
const generations = new Map<string, string>();
const serverVersion = () => undefined;
const noSubscribe = () => () => {};
let timer: number | undefined;

function notify() {
  for (const listener of listeners) listener();
}

function scheduleRefresh() {
  timer = window.setTimeout(() => {
    notify();
    if (listeners.size) scheduleRefresh();
  }, cacheWindowMs - Date.now() % cacheWindowMs);
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    scheduleRefresh();
    window.addEventListener("focus", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.clearTimeout(timer);
      timer = undefined;
      window.removeEventListener("focus", notify);
    }
  };
}

export function refreshProfileAvatar(url: string, generation: string) {
  generations.set(url, generation);
  notify();
}

/** Refresh open views within the cache window, keeping the persisted URL stable. */
export function useProfileAvatarDisplayUrl(url?: string | null) {
  const canonical = url && isCanonicalProfileAvatarUrl(url) ? url : undefined;
  const version = useSyncExternalStore(canonical ? subscribe : noSubscribe, () => {
    if (!canonical) return undefined;
    const generation = generations.get(canonical);
    const epoch = Math.floor(Date.now() / cacheWindowMs);
    return `${generation ? `&v=${encodeURIComponent(generation)}` : ""}&t=${epoch}`;
  }, serverVersion);
  if (!canonical || !version) return url;
  const publicEndpoint = "https://firebasestorage.googleapis.com";
  const displayUrl = isEmulatorRuntime()
    ? `http://localhost:${import.meta.env.VITE_STORAGE_EMULATOR_PORT || "9199"}${canonical.slice(publicEndpoint.length)}`
    : canonical;
  return displayUrl + version;
}

export function reportProfileAvatarLoadError(url?: string | null) {
  if (url) {
    logClientError("ProfileAvatar.image", new Error("Profile avatar image failed to load"), { stage: "load_image" });
  }
}
