import PublicClubPreview from "../../components/group/PublicClubPreview";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroupMemberRole } from "../../hooks/useGroup";
import { ErrorState, LoadingSkeleton } from "../../components/redesign";
import GroupDashboardPage from "./GroupDashboardPage";
import GroupEventsPage from "./GroupEventsPage";

/** Members enter their club's meetings; visitors retain the introduction/join flow. */
export default function ClubHomePage() {
  const { groupId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation("group");
  const memberUid = user && !user.isAnonymous ? user.uid : undefined;
  const { role, loading, error, retry } = useGroupMemberRole(groupId, memberUid);
  if (authLoading || memberUid && loading) return <LoadingSkeleton kind="list" count={3} />;
  if (memberUid && error) return <ErrorState title={t("error.loadFailed")} onRetry={retry} />;
  if (!memberUid) return <PublicClubPreview groupId={groupId} />;
  return role ? <GroupEventsPage /> : <GroupDashboardPage />;
}
