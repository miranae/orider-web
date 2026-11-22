import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let lastUpload: { url: string; generation: string } | undefined;
const serverGeneration = () => undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshProfileAvatar(url: string, generation: string) {
  lastUpload = { url, generation };
  for (const listener of listeners) listener();
}

/** Refresh the edited avatar in this browser without changing its stored URL. */
export function useProfileAvatarDisplayUrl(url?: string | null) {
  const generation = useSyncExternalStore(subscribe, () => lastUpload?.url === url ? lastUpload?.generation : undefined, serverGeneration);
  return url && generation ? `${url}&v=${encodeURIComponent(generation)}` : url;
}
