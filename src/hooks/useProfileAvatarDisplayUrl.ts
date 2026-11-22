import { useEffect, useSyncExternalStore } from "react";
import { doc, getDocFromServer, onSnapshot, type Firestore } from "firebase/firestore";
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
    const profileRef = doc(firestore, "users_public", uid);
    let active = true;
    let knownProfile = false;
    let sequence = 0;
    let alternateSignal: string | null | undefined;
    const isCurrent = () => active && services.auth?.currentUser === viewer
      && services.isSessionApproved?.(viewer ?? null) !== false;
    const generation = (value: unknown) => typeof value === "string" && /^[0-9]{1,21}$/.test(value) ? value : undefined;
    // Firestore shares subscriptions to the same document within the same app.
    const unsubscribe = onSnapshot(profileRef, { includeMetadataChanges: true }, (snapshot) => {
      if (!isCurrent() || snapshot.metadata?.fromCache) return;
      const data = snapshot.data();
      if (!data && !knownProfile) return;
      knownProfile = true;
      const signalUrl = typeof data?.photoURL === "string" ? data.photoURL : null;
      if (signalUrl === url) {
        sequence++;
        alternateSignal = undefined;
        refreshProfileAvatar(firestore, url, generation(data?.profileAvatarGeneration));
        return;
      }

      if (alternateSignal === signalUrl) return;
      alternateSignal = signalUrl;
      const request = ++sequence;
      // A different selection needs the normal public profile read before replacing the image.
      void getDocFromServer(profileRef).then((confirmed) => {
        if (!isCurrent() || request !== sequence) return;
        const current = confirmed.data();
        const selectedUrl = current?.photoURL;
        if (selectedUrl === url) {
          alternateSignal = undefined;
          refreshProfileAvatar(firestore, url, generation(current?.profileAvatarGeneration));
          return;
        }
        refreshProfileAvatar(firestore, url, typeof selectedUrl === "string" && selectedUrl.startsWith("https://") ? selectedUrl : false);
      }).catch((error) => {
        const isReadCurrent = () => isCurrent() && request === sequence;
        logClientError("ProfileAvatar.signal", error, { stage: "read_profile" }, services, viewer, "", isReadCurrent);
        if (isReadCurrent()) alternateSignal = undefined;
      });
    }, (error) => logClientError("ProfileAvatar.signal", error, { stage: "read_revision" }, services, viewer, "", isCurrent));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firestore, services, uid, url, viewer]);

  if (version === false) return null;
  if (version?.startsWith("https://")) return version;
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
