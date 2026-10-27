import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { LoadingSkeleton } from "../../components/redesign";
import PublicClubPreview from "../../components/group/PublicClubPreview";
import GroupEventsPage from "./GroupEventsPage";

/** Public previews must not subscribe to member-only group resources. */
export default function PublicGroupEventsEntry() {
  const { groupId } = useParams();
  const { user, loading } = useAuth();
  if (loading && !user) return <LoadingSkeleton kind="list" count={3} />;
  if (!user || user.isAnonymous) return <PublicClubPreview groupId={groupId} />;
  return <GroupEventsPage />;
}
