import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPublicClub, PublicClubUnavailable, type PublicClub } from "../../services/publicClubs";
import { EmptyState, ErrorState, LoadingSkeleton } from "../redesign";
import { LocalizedLink as Link } from "../LocalizedLink";
import { Card, Text } from "../../theme/components";
import ClubLoginGate from "./ClubLoginGate";
import ClubCafeSchedulePanel from "../../features/group/ClubCafeSchedulePanel";
export default function PublicClubPreview({ groupId }: { groupId: string | undefined }) {
  const { t, i18n } = useTranslation("group");
  const [club, setClub] = useState<PublicClub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setClub(null); setError(false); setLoading(true);
    if (!groupId) { setLoading(false); return; }
    void getPublicClub(groupId, controller.signal).then(value => { if (active) setClub(value); }).catch(reason => {
      if (active && !(reason instanceof PublicClubUnavailable)) setError(true);
    }).finally(() => { if (active) setLoading(false); });
    const refresh = () => { if (document.visibilityState !== "hidden") setAttempt(value => value + 1); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { active = false; controller.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [groupId, attempt]);
  return <div className="club-surface space-y-4" data-testid="public-club-preview">
    <Link to="/clubs">{t("empty.goToList")}</Link>
    {loading ? <LoadingSkeleton kind="list" count={2} /> : error ? <ErrorState title={t("error.publicLoadFailed")} onRetry={() => setAttempt(value => value + 1)} /> : !club ? <EmptyState title={t("empty.publicUnavailable")} /> : <Card padding="card">
      {club.badge && <Text as="p" tone="secondary">{club.badge}</Text>}
      <Text as="h1" variant="pageTitle">{club.name}</Text>
      <Text as="p" tone="secondary">{[club.kind && t(`card.kind.${club.kind === "running_crew" ? "runningCrew" : club.kind === "tri_team" ? "triTeam" : club.kind}`), club.city].filter(Boolean).join(" · ")}</Text>
      <Text as="p">{club.description || t("public.noDescription")}</Text>
      <Text as="p" tone="secondary">{(club.sports?.length ? club.sports : [club.discipline]).filter(Boolean).map(sport => t(`card.discipline.${sport}`)).join(" · ")}</Text>
      <Text as="p">{t(club.approval === "auto" ? "public.autoApproval" : "public.manualApproval")}</Text>
    </Card>}
    {club?.id === "club-lara" && !loading && !error && <ClubCafeSchedulePanel groupId={club.id} language={i18n.language} publicAccess />}
    <ClubLoginGate />
  </div>;
}
