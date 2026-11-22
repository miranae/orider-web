import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { doc, getDocFromServer, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { parseProfileAvatarUrl } from "@shared/profileAvatar";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { isEmulatorRuntime } from "../services/runtimeConfig";

const listeners = new Set<() => void>();
const uploadedGenerations = new WeakMap<User, Map<string, string>>();
const serverVersion = () => undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshProfileAvatar(viewer: User, url: string, generation: string) {
  const current = uploadedGenerations.get(viewer) ?? new Map<string, string>();
  if (current.get(url) === generation) return;
  current.set(url, generation);
  uploadedGenerations.set(viewer, current);
  for (const listener of listeners) listener();
}

export function useProfileAvatarDisplayUrl(url?: string | null) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const viewer = services.auth?.currentUser;
  const match = parseProfileAvatarUrl(url);
  const uid = match?.bucket === firestore?.app?.options?.storageBucket ? match?.uid : undefined;
  const uploadGeneration = useSyncExternalStore(subscribe,
    () => viewer && url ? uploadedGenerations.get(viewer)?.get(url) : undefined, serverVersion);
  const approved = services.isSessionApproved?.(viewer ?? null) !== false;
  const scope = useMemo(() => ({ firestore, services, url, viewer, approved }), [firestore, services, url, viewer, approved]);
  const [observed, setObserved] = useState<{ scope: typeof scope; version: string | false | undefined; uploadGeneration?: string }>();
  const version = observed?.scope === scope && observed.uploadGeneration === uploadGeneration
    ? observed.version ?? uploadGeneration
    : uploadGeneration;

  useEffect(() => {
    if (!uid || !url || !approved) return;
    let active = true;
    let knownProfile = false;
    let sequence = 0;
    let alternateSignal: string | null | undefined;
    const isCurrent = () => active && services.auth?.currentUser === viewer
      && services.isSessionApproved?.(viewer ?? null) !== false;
    const showVersion = (version: string | false | undefined) => {
      const uploadGeneration = viewer ? uploadedGenerations.get(viewer)?.get(url) : undefined;
      // An unchanged projection cannot replace a photo uploaded here while it catches up.
      setObserved(prior => prior?.scope === scope && prior.version === version ? prior : { scope, version, uploadGeneration });
    };
    const generation = (value: unknown) => typeof value === "string" && /^[0-9]{1,21}$/.test(value) ? value : undefined;
    const readFailed = (error: unknown) => {
      logClientError("ProfileAvatar.signal", error, { stage: "read_revision" }, services, viewer, "", isCurrent);
      if (isCurrent()) showVersion(false);
    };
    let unsubscribe: Unsubscribe | undefined;
    try {
      const profileRef = doc(firestore, "users_public", uid);
      // Firestore shares subscriptions to the same document within the same app.
      unsubscribe = onSnapshot(profileRef, { includeMetadataChanges: true }, (snapshot) => {
        if (!isCurrent() || snapshot.metadata?.fromCache) return;
        const data = snapshot.data();
        if (!data && !knownProfile) return;
        knownProfile = true;
        const signalUrl = typeof data?.photoURL === "string" ? data.photoURL : null;
        if (signalUrl === url) {
          sequence++;
          alternateSignal = undefined;
          showVersion(generation(data?.profileAvatarGeneration));
          return;
        }

        if (alternateSignal === signalUrl) return;
        alternateSignal = signalUrl;
        const request = ++sequence;
        // A different selection needs the normal public profile read before replacing the image.
        void Promise.resolve().then(() => getDocFromServer(profileRef)).then((confirmed) => {
          if (!isCurrent() || request !== sequence) return;
          const current = confirmed.data();
          const selectedUrl = current?.photoURL;
          if (selectedUrl === url) {
            alternateSignal = undefined;
            showVersion(generation(current?.profileAvatarGeneration));
            return;
          }
          showVersion(typeof selectedUrl === "string" && selectedUrl.startsWith("https://") ? selectedUrl : false);
        }).catch((error) => {
          const isReadCurrent = () => isCurrent() && request === sequence;
          logClientError("ProfileAvatar.signal", error, { stage: "read_profile" }, services, viewer, "", isReadCurrent);
          if (isReadCurrent()) {
            alternateSignal = undefined;
            showVersion(false);
          }
        });
      }, readFailed);
    } catch (error) {
      readFailed(error);
    }
    return () => {
      active = false;
      try {
        unsubscribe?.();
      } catch (error) {
        logClientError("ProfileAvatar.signal", error, { stage: "stop_revision" }, services, viewer, "", isCurrent);
      }
    };
  }, [approved, firestore, scope, services, uid, url, viewer]);

  if (!approved || version === false) return null;
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
