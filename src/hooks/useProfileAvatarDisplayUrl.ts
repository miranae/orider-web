import { useEffect, useSyncExternalStore } from "react";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import { parseProfileAvatarUrl } from "@shared/profileAvatar";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { isEmulatorRuntime } from "../services/runtimeConfig";

const listeners = new Set<() => void>();
const versions = new WeakMap<Firestore, Map<string, string | false>>();
const serverVersion = () => undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshProfileAvatar(firestore: Firestore, url: string, version: string | false | undefined) {
  const current = versions.get(firestore) ?? new Map<string, string | false>();
  if (current.get(url) === version) return;
  if (version === undefined) current.delete(url);
  else current.set(url, version);
  versions.set(firestore, current);
  for (const listener of listeners) listener();
}

export function useProfileAvatarDisplayUrl(url?: string | null) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const viewer = services.auth?.currentUser;
  const match = parseProfileAvatarUrl(url);
  const uid = match?.bucket === firestore?.app?.options?.storageBucket ? match?.uid : undefined;
  const version = useSyncExternalStore(subscribe, () => url ? versions.get(firestore)?.get(url) : undefined, serverVersion);

  useEffect(() => {
    if (!uid || !url) return;
    // Firestore shares subscriptions to the same document within the same app.
    return onSnapshot(doc(firestore, "users_public", uid), (snapshot) => {
      if (services.auth?.currentUser !== viewer || services.isSessionApproved?.(viewer ?? null) === false) return;
      const data = snapshot.data();
      if (snapshot.metadata?.fromCache || !data) return;
      if (data.photoURL !== url) {
        refreshProfileAvatar(firestore, url, false);
        return;
      }
      const revision: unknown = data.profileAvatarGeneration;
      refreshProfileAvatar(firestore, url, typeof revision === "string" && /^[0-9]{1,21}$/.test(revision) ? revision : undefined);
    }, (error) => logClientError("ProfileAvatar.signal", error, { stage: "read_revision" }, services, viewer));
  }, [firestore, services, uid, url, viewer]);

  if (version === false) return null;
  if (!match || !url) return url;
  const publicEndpoint = "https://firebasestorage.googleapis.com";
  const displayUrl = isEmulatorRuntime()
    ? `http://localhost:${import.meta.env.VITE_STORAGE_EMULATOR_PORT || "9199"}${url.slice(publicEndpoint.length)}`
    : url;
  return version ? `${displayUrl}&v=${encodeURIComponent(version)}` : displayUrl;
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
