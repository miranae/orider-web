import { Navigate, useLocation, useParams } from "react-router-dom";
import { useLocalizedPath } from "../../hooks/useLocalizedNavigate";

/** Old bookmarks and notifications enter the single meetings home, without adding history. */
export default function ClubEventsRedirect() {
  const { groupId } = useParams();
  const location = useLocation();
  const pathname = useLocalizedPath(`/club/${encodeURIComponent(groupId ?? "")}`);
  return <Navigate replace to={{ pathname, search: location.search, hash: location.hash }} state={location.state} />;
}
