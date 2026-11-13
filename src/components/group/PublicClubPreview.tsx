import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPublicClubPage, PublicClubUnavailable, type PublicClub } from "../../services/publicClubs";
import { EmptyState, ErrorState, LoadingSkeleton } from "../redesign";
import { LocalizedLink as Link } from "../LocalizedLink";
import { Card, Text } from "../../theme/components";
import ClubLoginGate from "./ClubLoginGate";
import MeetingSchedule from "../../features/group/MeetingSchedule";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
export default function PublicClubPreview({ groupId }: { groupId: string | undefined }) {
  const { t, i18n } = useTranslation("group");
  const [club, setClub] = useState<PublicClub | null>(null);
  const [schedule, setSchedule] = useState<ClubCafeSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 지금 보여 주는 소개가 어느 클럽 것인지. 같은 클럽의 포커스 재확인 동안에는 화면을 비우지 않는다
  // (포커스마다 소개가 사라졌다 다시 나타나 깜빡였다). 철회·실패가 확인되면 그때 지운다.
  const shownGroup = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const revalidating = !!groupId && shownGroup.current === groupId;
    if (!revalidating) { shownGroup.current = null; setClub(null); setSchedule(null); setLoading(true); }
    setError(false);
    if (!groupId) { setLoading(false); return; }
    void getPublicClubPage(groupId, controller.signal).then(value => { if (active) { shownGroup.current = groupId; setClub(value.club); setSchedule(value.schedule); } }).catch(reason => {
      if (!active) return;
      shownGroup.current = null; setClub(null); setSchedule(null);
      if (!(reason instanceof PublicClubUnavailable)) setError(true);
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
    {club?.id === groupId && schedule && !loading && !error && <MeetingSchedule key={groupId} schedule={schedule} language={i18n.language} />}
    <ClubLoginGate />
  </div>;
}
