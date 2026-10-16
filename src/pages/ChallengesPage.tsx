import "./ExploreReview.css";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useMyGroups } from "../hooks/useGroup";
import ChallengeFeed from "../components/discover/ChallengeFeed";
import GroupChallengesPanel from "../components/group/GroupChallengesPanel";
import CoachSignInButton from "./coach/CoachSignInButton";
import { ErrorState, LoadingSkeleton } from "../components/redesign";
import { Text } from "../theme/components";

export default function ChallengesPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { groups, loading, error, retry } = useMyGroups(user?.uid);
  return <div className="explore-challenges-surface space-y-6">
    <Text data-testid="E4-0" as="h1" variant="pageTitle">{t("nav.challenges")}</Text>
    {!user ? <div data-testid="E4-1-3"><CoachSignInButton /></div> : <>
      <ChallengeFeed part="monthly" />
      {loading ? <LoadingSkeleton kind="list" count={2} /> : error ? <ErrorState title={t("error.generic")} onRetry={retry} /> : <GroupChallengesPanel userId={user.uid} groups={groups} />}
    </>}
  </div>;
}
