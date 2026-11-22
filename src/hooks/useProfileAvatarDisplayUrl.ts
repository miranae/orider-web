import { useEffect, useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { parseProfileAvatarUrl } from "@shared/profileAvatar";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { isEmulatorRuntime } from "../services/runtimeConfig";

const listeners = new Set<() => void>();
const generations = new Map<string, string>();
const serverVersion = () => undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshProfileAvatar(url: string, generation: string) {
  if (generations.get(url) === generation) return;
  generations.set(url, generation);
  for (const listener of listeners) listener();
}

export function useProfileAvatarDisplayUrl(url?: string | null) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const match = parseProfileAvatarUrl(url);
  const uid = match?.bucket === firestore?.app?.options?.storageBucket ? match?.uid : undefined;
  const generation = useSyncExternalStore(subscribe, () => url ? generations.get(url) : undefined, serverVersion);

  useEffect(() => {
    if (!uid || !url) return;
    const viewer = services.auth?.currentUser;
    // Firestore shares subscriptions to the same document within the same app.
    return onSnapshot(doc(firestore, "users_public", uid), (snapshot) => {
      if (snapshot.get("photoURL") !== url) return;
      const revision: unknown = snapshot.get("profileAvatarGeneration");
      if (typeof revision === "string" && /^[0-9]{1,21}$/.test(revision)) refreshProfileAvatar(url, revision);
    }, (error) => logClientError("ProfileAvatar.signal", error, { stage: "read_revision" }, services, viewer));
  }, [firestore, services, uid, url]);

  if (!match || !url) return url;
  const publicEndpoint = "https://firebasestorage.googleapis.com";
  const displayUrl = isEmulatorRuntime()
    ? `http://localhost:${import.meta.env.VITE_STORAGE_EMULATOR_PORT || "9199"}${url.slice(publicEndpoint.length)}`
    : url;
  return generation ? `${displayUrl}&v=${encodeURIComponent(generation)}` : displayUrl;
}

export function useProfileAvatarLoadError() {
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser;
  return (url?: string | null) => {
    if (url) {
      logClientError("ProfileAvatar.image", new Error("Profile avatar image failed to load"),
        { stage: "load_image" }, services, viewer);
    }
  };
}
