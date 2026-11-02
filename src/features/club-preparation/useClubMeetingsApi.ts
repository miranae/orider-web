import { useMemo } from "react";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createClubMeetingsApi } from "../../services/clubMeetings";

export function useClubMeetingsApi() {
  const services = useFirebaseServices();
  return useMemo(() => createClubMeetingsApi(services), [services]);
}
