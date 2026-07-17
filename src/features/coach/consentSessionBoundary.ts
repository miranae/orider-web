const RESET_EVENT = "orider:coach-consent-revoked";

/** #550 owns draft/requestId. #549 only signals that its in-memory session must be cleared. */
export function notifyCoachConsentSessionReset(): void {
  window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

export function subscribeCoachConsentSessionReset(onReset: () => void): () => void {
  window.addEventListener(RESET_EVENT, onReset);
  return () => window.removeEventListener(RESET_EVENT, onReset);
}
