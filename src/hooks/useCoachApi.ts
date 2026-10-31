import { useMemo } from "react";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import * as coach from "../services/coachClient";
import * as consent from "../services/coachConsentClient";

export function useCoachApi() {
  const services = useFirebaseServices();
  return useMemo(() => services.scope === "embedded" ? coach.createCoachClient(services) : coach, [services]);
}
export function useCoachConsentApi() {
  const services = useFirebaseServices();
  return useMemo(() => services.scope === "embedded" ? consent.createCoachConsentClient(services) : consent, [services]);
}
