import { getVisibleEventPage } from "../../services/eventDiscovery";
import "./ClubSurface.css";
import { LockKeyhole, Users } from "lucide-react";
import { isActiveEventRegistration } from "../../features/event/activeRegistration";
import Modal from "../../components/Modal";
import InfoTip from "../../components/InfoTip";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { collection, doc, getDoc, query, where, limit, onSnapshot } from "firebase/firestore";
import { auth, ensureAppCheckReady, firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import type { JoinGroupPublicResult } from "../../features/group/groupJoinResult";
import { canManageGroup } from "../../features/group/groupPermissions";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase";
import { useToast } from "../../contexts/ToastContext";
import { useGroup, useGroupMemberRole, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import { createGroupPost, updateGroupPost, useGroupPosts } from "../../hooks/useGroupPosts";
import PublicClubPreview from "../../components/group/PublicClubPreview";
import GroupSubNav from "../../components/group/GroupSubNav";
import RideCard from "../../components/group/RideCard";
import Avatar from "../../components/Avatar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { DropdownSelect, Button, Card, Chip, Text, buttonClass, Textarea } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

interface UpcomingEvent {
  id: string;
  name: string;
  startTime: number;
  status: string;
  participantCount: number | null;
  myRsvp: boolean | null;
}

export default function GroupDashboardPage() {
  const { t, i18n } = useTranslation(["group", "event"]);
  const { groupId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const dialog = useDialog();
  const [joining, setJoining] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"spam" | "abuse" | "privacy" | "illegal" | "other">("other");
  const [postActionBusy, setPostActionBusy] = useState(false);
  const { showToast } = useToast();
  const { role: currentMemberRole, loading: roleLoading, error: roleError, retry: retryRole } = useGroupMemberRole(groupId, user?.uid);
  const accessKey = `${user?.uid ?? ""}:${currentMemberRole ?? ""}`;
  const { group, loading: groupLoading, error: groupError, inactive: groupInactive } = useGroup(user ? groupId : undefined, accessKey);
  const { members, loading: membersLoading, error: membersError, retry: retryMembers } = useGroupMembers(user && currentMemberRole ? groupId : undefined, 8, accessKey);

  const { rides, aggregate, loading: ridesLoading, error: ridesError, retry: retryRides } = useGroupRideStats(user && currentMemberRole ? groupId : undefined, accessKey);
  const { posts, loading: postsLoading, error: postsError } = useGroupPosts(user && currentMemberRole ? groupId : undefined, accessKey);
  const [postContent, setPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingPost, setSavingPost] = useState(false);
  const editIntent = useRef(0);
  useEffect(() => {
    editIntent.current += 1;
    setPostContent("");
    setPosting(false);
    setEditingPostId(null);
    setEditingContent("");
    setSavingPost(false);
    setJoining(false); setJoinPending(false); setPostActionBusy(false); setReportingPostId(null);
    return () => { editIntent.current += 1; };
  }, [groupId, accessKey]);

  useEffect(() => {
    if (!user || !groupId || currentMemberRole) return;
    return onSnapshot(query(collection(firestore, "users", user.uid, "group_requests"), where("groupId", "==", groupId), where("status", "==", "pending"), limit(1)), snapshot => setJoinPending(!snapshot.empty), error => { logClientError("GroupDashboardPage.pending", error, { groupId }); });
  }, [groupId, user?.uid, currentMemberRole]);

  // 다가오는 그룹 이벤트
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [upcomingError, setUpcomingError] = useState(false);
  const [upcomingIncomplete, setUpcomingIncomplete] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingAttempt, setUpcomingAttempt] = useState(0);
  useEffect(() => {
    if (!groupId || !user) { setUpcomingLoading(false); return; }
    let cancelled = false;
    setUpcomingEvents([]);
    setUpcomingError(false);
    setUpcomingIncomplete(false);
    setUpcomingLoading(true);
    (async () => {
      try {
        const snap = await getVisibleEventPage({ groupId, publicOnly: !currentMemberRole, statuses: ["OPEN", "LIVE"], limit: 3 });
        if (cancelled) return;
        setUpcomingIncomplete(Boolean(snap.nextCursor));
        const list: UpcomingEvent[] = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          const info = data.info ?? {};
          const startTime =
            typeof info.startTime === "number" ? info.startTime :
            info.startTime?._seconds ? info.startTime._seconds * 1000 :
            info.startTime?.seconds ? info.startTime.seconds * 1000 : 0;
          let myRsvp: boolean | null = null;
          if (user?.uid && currentMemberRole) {
            try {
              const participant = await getDoc(doc(firestore, "events", d.id, "participants", user.uid));
              myRsvp = participant.exists() && isActiveEventRegistration(participant.data()?.status);
            } catch (err) {
              logClientError("GroupDashboardPage.loadMyRsvp", err, { groupId, eventId: d.id });
            }
          }
          return {
            id: d.id,
            name: info.name ?? t("dashboard.fallbackEventName"),
            startTime,
            status: info.status ?? "UNKNOWN",
            participantCount: typeof data.counters?.totalRegistered === "number" ? data.counters.totalRegistered : null,
            myRsvp,
          };
        }));
        if (!cancelled) setUpcomingEvents(list);
      } catch (err) {
        // 인덱스 없을 시 조용히 실패
        if (!cancelled) { setUpcomingError(true); logClientError("GroupDashboardPage.loadUpcomingEvents", err, { groupId }); }
      } finally { if (!cancelled) setUpcomingLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupId, t, user?.uid, accessKey, upcomingAttempt]);

  if (!user && !authLoading) return <PublicClubPreview groupId={groupId} />;

  if (roleError && !roleLoading) {
    return <ErrorState title={t("error.loadFailed")} onRetry={retryRole} />;
  }

  if (authLoading || groupLoading || roleLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-4 w-32 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="w-10 h-10 rounded-full" style={{ background: "var(--bg-2)" }} />)}
        </div>
      </div>
    );
  }

  if (groupError) {
    if (isPermissionDeniedError(groupError)) {
      return (
        <div className="max-w-xl mx-auto py-16">
          <EmptyState
            icon={<LockKeyhole size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
            title={t("empty.groupAccessDenied")}
            description={t("empty.groupAccessDeniedDesc")}
            actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
          />
        </div>
      );
    }
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("error.loadFailed")} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<Users size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
          title={groupInactive ? t("empty.groupInactive") : t("empty.groupNotFound")}
          description={groupInactive ? t("empty.groupInactiveDesc") : undefined}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
        />
      </div>
    );
  }

  const canManage = canManageGroup(group, user?.uid, currentMemberRole);
  if (!currentMemberRole && group.visibility !== "public") return <div data-testid="C1.private"><EmptyState title={t("empty.groupAccessDenied")} description={t("empty.groupAccessDeniedDesc")} /></div>;
  if (!currentMemberRole) return <div data-testid="C1.preview" className="club-surface space-y-4">
    <Text as="h1" variant="pageTitle" data-testid="C1-0-1">{group.name}</Text><p data-testid="C1-2-1">{group.description}</p>{group.rules && <Card data-testid="C1-2"><h2>{t("dashboard.rules.title")}</h2><p data-testid="C1-2-2" className="whitespace-pre-wrap">{group.rules}</p></Card>}
    <p>{t("dashboard.previewHint")}</p>
    {user && group.visibility === "public" && <button type="button" data-testid="C1-0-3" className={buttonClass({ variant: "primary" })} disabled={joining || joinPending} onClick={async () => {
      const uid = user.uid; const intent = editIntent.current; setJoining(true);
      try {
        await ensureAppCheckReady(); if (editIntent.current !== intent || auth.currentUser?.uid !== uid) return;
        const result = await httpsCallable<{ groupId: string }, JoinGroupPublicResult>(functions, "joinGroupPublic")({ groupId: group.id });
        if (editIntent.current !== intent || auth.currentUser?.uid !== uid) return;
        if (result.data.success !== true) throw new Error("invalid-group-join-response");
        setJoinPending(result.data.status === "pending");
      } catch (error) { logClientError("GroupDashboardPage.join", error, { groupId }); showToast(t("error.joinFailed"), "error"); }
      finally { if (editIntent.current === intent) setJoining(false); }
    }}>{joinPending ? t("card.joinPending") : t("button.join")}</button>}
    {upcomingError && <ErrorState title={t("error.eventsLoadFailed")} onRetry={()=>setUpcomingAttempt(value=>value+1)} compact />}
    {upcomingEvents.slice(0, 3).map(event => <Card key={event.id}><Link to={`/event/${event.id}`}>{event.name}</Link></Card>)}
  </div>;
  const canPost = currentMemberRole !== null && (canManage || group.toggles?.membersPost !== false);
  const submitPost = async () => {
    if (!groupId || !user || !canPost || posting || !postContent.trim()) return;
    const uid = user.uid;
    const intent = editIntent.current;
    const submitted = postContent;
    const current = () => intent === editIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;
    setPosting(true);
    try {
      await createGroupPost({groupId, content: submitted, kind: canManage ? "announcement" : "post"});
      if (!current()) return;
      setPostContent(draft => draft === submitted ? "" : draft);
      showToast(t("dashboard.posts.success"));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupDashboardPage.createPost", err, { groupId });
      showToast(t("dashboard.posts.failed"), "error");
    } finally { if (current()) setPosting(false); }
  };

  const savePost = async () => {
    if (!groupId || !user || !editingPostId || savingPost) return;
    const uid = user.uid;
    const intent = editIntent.current;
    const post = posts.find((item) => item.id === editingPostId);
    if (!post || currentMemberRole === null || (!canManage && (post.kind !== "post" || post.authorId !== uid))) return;
    setSavingPost(true);
    try {
      await ensureAppCheckReady();
      if (editIntent.current !== intent || auth.currentUser?.uid !== uid) return;
      await updateGroupPost({ groupId, postId: post.id, content: editingContent });
      if (editIntent.current !== intent || auth.currentUser?.uid !== uid) return;
      setEditingPostId(null);
      setEditingContent("");
      showToast(t("dashboard.posts.updated"));
    } catch (err) {
      if (editIntent.current !== intent || auth.currentUser?.uid !== uid) return;
      logClientError("GroupDashboardPage.updatePost", err, { groupId, postId: post.id });
      showToast(t("dashboard.posts.updateFailed"), "error");
    } finally {
      if (editIntent.current === intent) setSavingPost(false);
    }
  };

  return (
    <div className="club-surface club-dashboard">
      <Modal accessible open={reportingPostId !== null} onClose={() => setReportingPostId(null)} title={t("dashboard.posts.reportTitle")} maxWidth="max-w-md">
        <label className="grid gap-2 text-[length:var(--ft-body-size)]">{t("dashboard.posts.reportReasonLabel")}<DropdownSelect value={reportReason} onChange={value => setReportReason(value as typeof reportReason)} label={t("dashboard.posts.reportReasonLabel")} options={(["spam", "abuse", "privacy", "illegal", "other"] as const).map(reason => ({ value: reason, label: t(`dashboard.posts.reason.${reason}`) }))} /></label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonClass({ variant: "secondary" })} onClick={() => setReportingPostId(null)}>{t("dashboard.posts.cancel")}</button>
          <button type="button" className={buttonClass({ variant: "primary" })} disabled={postActionBusy} onClick={async () => {
          if (!user || !reportingPostId || postActionBusy) return;
          const uid = user.uid; const intent = editIntent.current;
          const postId = reportingPostId;
          const isCurrent = () => editIntent.current === intent && auth.currentUser?.uid === uid;
          setPostActionBusy(true);
          try {
            await ensureAppCheckReady(); if (!isCurrent()) return;
            await httpsCallable(functions, "reportGroupPost")({ groupId, postId, reason: reportReason });
            if (isCurrent()) { setReportingPostId(null); showToast(t("dashboard.posts.reported")); }
          } catch (error) { if (isCurrent()) showToast(t("dashboard.posts.actionFailed"), "error"); logClientError("GroupDashboardPage.reportPost", error, { groupId, postId }); }
          finally { if (isCurrent()) setPostActionBusy(false); }
          }}>{t("dashboard.posts.reportSubmit")}</button>
        </div>
      </Modal>
      <GroupSubNav group={group} isCreator={canManage} showDescription={false} />

      {/* Hero 영역 */}
      <Card padding="none" className="club-identity mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
        <div className="club-identity-main">
          <div style={{
            width: "calc(var(--space-6) * 2)", height: "calc(var(--space-6) * 2)", borderRadius: "var(--r-xl)", background: "var(--bg-2)",
            border: "1px solid var(--line)", display: "grid", placeItems: "center",
            fontSize: "var(--ft-body-medium-size)", lineHeight: 1, fontWeight: 800, color: "var(--lime)", letterSpacing: "-0.02em", flexShrink: 0,
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {(group.badge ?? group.name ?? "").slice(0, 3).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text as="div" variant="body" style={{ marginBottom: "var(--space-1-5)" }}>
              {group.kind === "running_crew" ? t("dashboard.kind.runningCrew") : group.kind === "tri_team" ? t("dashboard.kind.triTeam") : group.kind === "corporate" ? t("dashboard.kind.corporate") : t("dashboard.kind.club")}
              {group.city ? ` · ${group.city}` : ""}
            </Text>

          </div>
        </div>
        {group.description && (
          <details data-testid="C1-2-1" className="mt-3"><summary>{t("dashboard.aboutClub")}</summary><p className="whitespace-pre-wrap">{group.description}</p></details>
        )}
      </Card>

      {group.rules?.trim() && (
        <Card padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
          <h2 className="club-card-title" style={{ color: "var(--ink-1)", marginBottom: "var(--space-2)" }}>
            {t("dashboard.rules.title")}
          </h2>
          <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {group.rules}
          </p>
        </Card>
      )}

      <Card data-testid="C1-3" padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="club-card-title" style={{ color: "var(--ink-1)" }}>{t("dashboard.posts.title")}</h2>
          <Text as="span" variant="body">{t("dashboard.posts.latest")}</Text>
        </div>
        {canPost && (
          <div className="flex items-end mb-4" style={{ gap: "var(--space-2)" }}>
            <Textarea data-testid="C1-3-1"
              value={postContent}
              onChange={(event) => setPostContent(event.target.value.slice(0, 1_000))}
              maxLength={1_000}
              rows={2}
              placeholder={canManage ? t("dashboard.posts.announcementPlaceholder") : t("dashboard.posts.placeholder")}
              aria-label={t("dashboard.posts.placeholder")}
              style={{ flex: 1, resize: "vertical", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)", background: "var(--bg-2)", color: "var(--ink-0)", padding: "10px 12px" }}
            />
            <button data-testid="C1-3-2" type="button" className={buttonClass({ variant: "primary", size: "sm" })} disabled={posting || !postContent.trim()} onClick={() => { void submitPost(); }}>
              {posting ? t("dashboard.posts.posting") : t("dashboard.posts.submit")}
            </button>
          </div>
        )}
        {postsLoading ? (
          <LoadingSkeleton kind="list" count={2} />
        ) : postsError ? <ErrorState title={t("error.loadFailed")} onRetry={() => window.location.reload()} /> : posts.length === 0 ? (
          <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>{t("dashboard.posts.empty")}</p>
        ) : (
          <ul className="space-y-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((post) => (
              <li key={post.id} style={{ padding: "10px 12px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)" }}>
                <div className="flex items-center mb-1" style={{ gap: "var(--space-2)" }}>
                  {post.kind === "announcement" && <Chip style={{ color: "var(--amber)", fontSize: "var(--ft-body-size)" }}>{t("dashboard.posts.announcement")}</Chip>}
                  <span className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-1)" }}>{post.authorName || t("dashboard.posts.memberFallback")}</span>
                  {post.createdAt > 0 && <span className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-4)" }}>{new Date(post.createdAt).toLocaleDateString(i18n.language)}</span>}
                </div>
                {editingPostId === post.id ? (
                  <div className="space-y-2">
                    <Textarea
                      aria-label={t("dashboard.posts.editContent")}
                      className="ds-input"
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value.slice(0, 1_000))}
                      maxLength={1_000}
                      rows={3}
                      disabled={savingPost}
                    />
                    <div className="flex gap-2">
                      <button type="button" className={buttonClass({ variant: "primary", size: "sm" })} disabled={savingPost || !editingContent.trim()} onClick={() => { void savePost(); }}>
                        {t("dashboard.posts.save")}
                      </button>
                      <button type="button" className={buttonClass({ variant: "secondary", size: "sm" })} disabled={savingPost} onClick={() => { setEditingPostId(null); setEditingContent(""); }}>
                        {t("dashboard.posts.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.content}</p>
                    {currentMemberRole !== null && (canManage || post.kind === "post" || post.authorId !== user?.uid) && <button data-testid="C1-3-4" type="button" disabled={postActionBusy} className={buttonClass({ variant: "ghost", size: "sm" })} onClick={async () => {
                      if (!user || postActionBusy) return;
                      const uid = user.uid; const intent = editIntent.current;
                      const isCurrent = () => editIntent.current === intent && auth.currentUser?.uid === uid;
                      const deleting = canManage || (post.kind === "post" && post.authorId === user?.uid);
                      if (deleting && !(await dialog.confirm(t("dashboard.posts.deleteConfirm"), { destructive: true }))) return;
                      if (!deleting) { setReportingPostId(post.id); return; }
                      if (!isCurrent()) return;
                      setPostActionBusy(true);
                      try {
                        await ensureAppCheckReady();
                        if (!isCurrent()) return;
                        await httpsCallable(functions, "deleteGroupPost")({ groupId, postId: post.id });
                        if (!isCurrent()) return;
                        if (!deleting) showToast(t("dashboard.posts.reported"));
                      } catch (error) { if (!isCurrent()) return; logClientError("GroupDashboardPage.postAction", error, { groupId, postId: post.id }); showToast(t("dashboard.posts.actionFailed"), "error"); }
                      finally { if (isCurrent()) setPostActionBusy(false); }
                    }}>{canManage || (post.kind === "post" && post.authorId === user?.uid) ? t("dashboard.posts.delete") : t("dashboard.posts.report")}</button>}
                    {currentMemberRole !== null && (canManage || (post.kind === "post" && post.authorId === user?.uid)) && (
                      <button data-testid="C1-3-3" type="button" className={buttonClass({ variant: "ghost", size: "sm" })} disabled={savingPost} onClick={() => { setEditingPostId(post.id); setEditingContent(post.content); }}>
                        {t("dashboard.posts.edit")}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ridesLoading ? <LoadingSkeleton kind="list" count={1} /> : ridesError ? (
        <Card className="club-news-stats-error mb-5" role="alert" padding="card"><div>
          <Text as="p" variant="bodyMedium">{t(ridesError === "unavailable" ? "error.rideStatsUnavailable" : "error.rideStatsLoadFailed")}</Text>
          <Text as="p" variant="body" tone="secondary">{t("error.rideStatsRetry")}</Text>
        </div><Button variant="secondary" size="sm" onClick={retryRides}>{t("invite.retry")}</Button></Card>
      ) : aggregate && (
        <Card data-testid="C1-1" padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
          <div data-testid="C1-1-1" className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: "var(--space-3)" }}>
            <div>
              <Text as="div" variant="body"><InfoTip title={t("dashboard.identity.lifetimeDistance")} content={t("dashboard.identity.distanceHelp")} label={t("dashboard.identity.lifetimeDistance")}>{t("dashboard.identity.lifetimeDistance")}</InfoTip></Text>
              <Text as="div" variant="dataLarge">{(aggregate.lifetimeDistance / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km</Text>
            </div>
            <div>
              <Text as="div" variant="body">{t("dashboard.identity.rideCount")}</Text>
              <Text as="div" variant="dataLarge">{aggregate.lifetimeRideCount.toLocaleString()} {t("members.rideUnit")}</Text>
            </div>
            <div>
              <Text as="div" variant="body"><InfoTip title={t("dashboard.identity.longestRide")} content={t("dashboard.identity.longestRideHelp")} label={t("dashboard.identity.longestRide")}>{t("dashboard.identity.longestRide")}</InfoTip></Text>
              <Text as="div" variant="dataLarge">{(aggregate.longestRideDistance / 1000).toFixed(1)} km</Text>
            </div>
          </div>
          {(group.monthlyGoalKm ?? 0) > 0 && (
            <div data-testid="C1-1-2" className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center justify-between text-[length:var(--ft-body-size)] mb-2" style={{ color: "var(--ink-2)" }}>
                <span>{t("dashboard.monthlyGoal.title", { month: aggregate.monthKey })}</span>
                <span>{(aggregate.monthlyDistance / 1000).toFixed(1)} / {group.monthlyGoalKm?.toLocaleString()} km</span>
              </div>
              <div style={{ height: 8, borderRadius: "var(--r-xl)", overflow: "hidden", background: "var(--bg-3)" }}>
                <div style={{ width: `${Math.min(100, aggregate.monthlyDistance / ((group.monthlyGoalKm ?? 1) * 1000) * 100)}%`, height: "100%", background: "var(--lime)" }} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 다가오는 이벤트 */}
      {(upcomingEvents.length > 0 || upcomingLoading || upcomingError || upcomingIncomplete) && (
        <Card data-testid="C1-4" padding="none" className="mb-5 p-4" style={{ borderRadius: "var(--r-lg)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="club-card-title" style={{ color: "var(--ink-1)" }}>{t("dashboard.upcomingEvents")}</h2>
            <Link data-testid="C1-4-1" to={`/club/${groupId}/events`} className="text-[length:var(--ft-body-size)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreEvents")}</Link>
          </div>
          {upcomingIncomplete && !upcomingLoading && !upcomingError && <p role="status">{t("event:discovery.partial")}</p>}
          {upcomingLoading ? <LoadingSkeleton kind="list" count={2} /> : upcomingError ? <ErrorState title={t("error.eventsLoadFailed")} onRetry={()=>setUpcomingAttempt(value=>value+1)} compact /> : <ul role="list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--space-2)" }}>
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between" style={{ padding: "10px 12px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", gap: "var(--space-2)" }}>
                <Link to={`/event/${e.id}`} className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="text-[length:var(--ft-body-size)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{e.name}</div>
                    <div className="text-[length:var(--ft-body-size)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                      {e.startTime ? new Date(e.startTime).toLocaleDateString(i18n.language, { month: "long", day: "numeric", weekday: "short" }) : "-"}
                      {e.participantCount != null ? ` · ${t("dashboard.eventParticipants", { count: e.participantCount })}` : ""}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
                  {e.status === "OPEN" && (
                    <Link
                      to={e.myRsvp === null || e.myRsvp ? `/event/${e.id}` : `/event/${e.id}/register`}
                      className={buttonClass({ variant: e.myRsvp ? "secondary" : "primary", size: "sm" })}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {e.myRsvp === null ? t("events.viewDetails") : e.myRsvp ? t("dashboard.eventAction.manageRsvp") : t("dashboard.eventAction.rsvp")}
                    </Link>
                  )}
                  {e.status === "LIVE" && <Chip style={{ color: "var(--lime)", fontSize: "var(--ft-body-size)", whiteSpace: "nowrap" }}>{t("dashboard.eventStatus.live")}</Chip>}
                </div>
              </li>
            ))}
          </ul>}
        </Card>
      )}

      <div className={`club-news-layout${ridesError || rides.length === 0 ? " club-news-layout--no-rides" : ""}`}>
        {/* 멤버 랭킹 */}
        <div className="flex-1 min-w-0">
          {/* 최근 그룹 라이드 */}
          {!ridesError && (group.sports ?? [group.discipline ?? "bike"]).includes("bike") && <div className="mt-5">
            <div data-testid="C1-4-2" className="flex items-center justify-between mb-3">
              <h2 className="club-card-title" style={{ color: "var(--ink-1)" }}>{t("dashboard.recentRides")}</h2>
              <Link to={`/club/${groupId}/rides`} className="text-[length:var(--ft-body-size)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreRides")}</Link>
            </div>
            {ridesLoading ? (
              <LoadingSkeleton kind="list" count={3} />
            ) : rides.length === 0 ? (
              <Text as="p" variant="body" tone="secondary">{t("dashboard.noRides")}</Text>
            ) : (
              <div className="space-y-3">
                {rides.slice(0, 3).map((r) => (
                  <RideCard key={r.groupRideId} ride={r} />
                ))}
              </div>
            )}
          </div>}
        </div>

        {/* Sidebar */}
        <div className="club-news-sidebar">
          {/* 멤버 미리보기 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="club-card-title" style={{ color: "var(--ink-1)" }}>{t("dashboard.memberPreview")}</h2>
              <Link to={`/club/${groupId}/members`} className="text-[length:var(--ft-body-size)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreMembers")}</Link>
            </div>
            {membersError ? <ErrorState title={t("error.membersLoadFailed")} onRetry={retryMembers} compact /> : membersLoading ? (
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full animate-pulse" style={{ background: "var(--bg-2)" }} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                {members.map((m) => (
                  <Link key={m.id} to={`/athlete/${m.id}`} title={m.profile?.nickname ?? m.id}>
                    <Avatar name={m.profile?.nickname ?? "?"} imageUrl={m.profile?.photoURL} size="md" />
                  </Link>
                ))}
                {group.memberCount > members.length && (
                  <Link
                    to={`/club/${groupId}/members`}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[length:var(--ft-body-size)]"
                    style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}
                  >
                    +{group.memberCount - members.length}
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* 그룹 정보 카드 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
            <h2 className="club-card-title mb-3" style={{ color: "var(--ink-1)" }}>{t("dashboard.groupInfo")}</h2>
            <dl className="space-y-2 text-[length:var(--ft-body-size)]">

              {group.createdAt && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--ink-2)" }}>{t("dashboard.createdDate")}</dt>
                  <dd className="font-medium" style={{ color: "var(--ink-0)" }}>
                    {(() => {
                      const ts = group.createdAt;
                      const d = typeof ts === "number" ? new Date(ts)
                        : ts && typeof ts === "object" && "seconds" in ts ? new Date((ts as { seconds: number }).seconds * 1000)
                        : null;
                      return d ? d.toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" }) : "";
                    })()}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
