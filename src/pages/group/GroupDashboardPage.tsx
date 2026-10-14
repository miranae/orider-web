import { isActiveEventRegistration } from "../../features/event/activeRegistration";
import Modal from "../../components/Modal";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
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
import GroupSubNav from "../../components/group/GroupSubNav";
import RideCard from "../../components/group/RideCard";
import Avatar from "../../components/Avatar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Card, Chip, Text, buttonClass } from "../../theme/components";

interface UpcomingEvent {
  id: string;
  name: string;
  startTime: number;
  status: string;
  participantCount: number | null;
  myRsvp: boolean;
}

export default function GroupDashboardPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const dialog = useDialog();
  const [joining, setJoining] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"spam" | "abuse" | "privacy" | "illegal" | "other">("other");
  const [postActionBusy, setPostActionBusy] = useState(false);
  const { showToast } = useToast();
  const { role: currentMemberRole, loading: roleLoading } = useGroupMemberRole(groupId, user?.uid);
  const accessKey = `${user?.uid ?? ""}:${currentMemberRole ?? ""}`;
  const { group, loading: groupLoading, error: groupError, inactive: groupInactive } = useGroup(groupId, accessKey);
  const { members, loading: membersLoading } = useGroupMembers(currentMemberRole ? groupId : undefined, 8, accessKey);

  const { rides, aggregate, loading: ridesLoading, error: ridesError, retry: retryRides } = useGroupRideStats(currentMemberRole ? groupId : undefined, accessKey);
  const { posts, loading: postsLoading, error: postsError } = useGroupPosts(currentMemberRole ? groupId : undefined, accessKey);
  const [postContent, setPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingPost, setSavingPost] = useState(false);
  const editIntent = useRef(0);
  useEffect(() => {
    editIntent.current += 1;
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
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setUpcomingEvents([]);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(firestore, "events"),
            where("info.groupId", "==", groupId),
            where("info.status", "in", ["OPEN", "LIVE"]),
            ...(!currentMemberRole ? [where("info.visibility", "==", "PUBLIC")] : []),
            orderBy("info.startTime", "asc"),
            limit(3)
          )
        );
        const list: UpcomingEvent[] = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          const info = data.info ?? {};
          const startTime =
            typeof info.startTime === "number" ? info.startTime :
            info.startTime?._seconds ? info.startTime._seconds * 1000 :
            info.startTime?.seconds ? info.startTime.seconds * 1000 : 0;
          let myRsvp = false;
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
        if (!cancelled) logClientError("GroupDashboardPage.loadUpcomingEvents", err, { groupId });
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, t, user?.uid, accessKey]);

  if (groupLoading || roleLoading) {
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
            icon="🔒"
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
          icon="👥"
          title={groupInactive ? t("empty.groupInactive") : t("empty.groupNotFound")}
          description={groupInactive ? t("empty.groupInactiveDesc") : undefined}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
        />
      </div>
    );
  }

  const canManage = canManageGroup(group, user?.uid, currentMemberRole);
  if (!currentMemberRole && group.visibility !== "public") return <div data-testid="C1.private"><EmptyState title={t("empty.groupAccessDenied")} description={t("empty.groupAccessDeniedDesc")} /></div>;
  if (!currentMemberRole) return <div data-testid="C1.preview" className="space-y-4">
    <h1 data-testid="C1-0-1">{group.name}</h1><p data-testid="C1-2-1">{group.description}</p>{group.rules && <Card data-testid="C1-2"><h2>{t("dashboard.rules.title")}</h2><p data-testid="C1-2-2" className="whitespace-pre-wrap">{group.rules}</p></Card>}
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
    {upcomingEvents.slice(0, 3).map(event => <Card key={event.id}><Link to={`/event/${event.id}`}>{event.name}</Link></Card>)}
  </div>;
  if (ridesLoading) {
    return <div><GroupSubNav group={group} isCreator={canManage} /><LoadingSkeleton kind="list" count={5} /></div>;
  }
  if (ridesError) {
    return (
      <div>
        <GroupSubNav group={group} isCreator={canManage} />
        <ErrorState
          title={t(ridesError === "unavailable" ? "error.rideStatsUnavailable" : "error.rideStatsLoadFailed")}
          description={t("error.rideStatsRetry")}
          onRetry={retryRides}
        />
      </div>
    );
  }
  const canPost = currentMemberRole !== null && (canManage || group.toggles?.membersPost !== false);
  const submitPost = async () => {
    if (!groupId || !user || posting) return;
    setPosting(true);
    try {
      await createGroupPost({
        groupId,
        content: postContent,
        kind: canManage ? "announcement" : "post",
      });
      setPostContent("");
      showToast(t("dashboard.posts.success"));
    } catch (err) {
      logClientError("GroupDashboardPage.createPost", err, { groupId });
      showToast(t("dashboard.posts.failed"), "error");
    } finally {
      setPosting(false);
    }
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
    <div>
      <Modal open={reportingPostId !== null} onClose={() => setReportingPostId(null)} title={t("dashboard.posts.report")} maxWidth="max-w-md">
        <label>{t("dashboard.posts.report")}<select value={reportReason} onChange={event => setReportReason(event.target.value as typeof reportReason)} className="ds-input">{(["spam", "abuse", "privacy", "illegal", "other"] as const).map(reason => <option key={reason} value={reason}>{t(`dashboard.posts.reason.${reason}`)}</option>)}</select></label>
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
        }}>{t("dashboard.posts.report")}</button>
      </Modal>
      <GroupSubNav group={group} isCreator={canManage} />

      {/* Hero 영역 */}
      <Card padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "24px 28px" }}>
        <div className="flex items-center" style={{ gap: 'var(--space-5)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: "var(--r-xl)", background: "var(--bg-2)",
            border: "1px solid var(--line)", display: "grid", placeItems: "center",
            fontSize: "var(--fs-2xl)", fontWeight: 800, color: "var(--lime)", letterSpacing: "-0.02em", flexShrink: 0,
          }}>
            {(group.badge ?? group.name ?? "").slice(0, 3).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}>
              {group.kind === "running_crew" ? t("dashboard.kind.runningCrew") : group.kind === "tri_team" ? t("dashboard.kind.triTeam") : group.kind === "corporate" ? t("dashboard.kind.corporate") : t("dashboard.kind.club")}
              {group.city ? ` · ${group.city}` : ""}
            </Text>
            <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)", margin: 0 }}>{group.name}</h1>
            <div className="flex items-center flex-wrap text-[length:var(--fs-sm)] mt-2" style={{ gap: 'var(--space-3)', color: "var(--ink-2)" }}>
              <span>{t("dashboard.memberCount", { count: group.memberCount })}</span>
              {group.createdAt && (
                <>
                  <span style={{ color: "var(--ink-4)" }}>·</span>
                  <span>{t("dashboard.created")} {new Date(typeof group.createdAt === "number" ? group.createdAt : 0).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</span>
                </>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
              <Link to="/explore/events" className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`}>{t("dashboard.events")}</Link>
              <Link to={`/club/${groupId}/settings`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`}>{t("dashboard.manage")}</Link>
            </div>
          )}
        </div>
        {group.description && (
          <details data-testid="C1-2-1" className="mt-3"><summary className="line-clamp-2 text-[length:var(--fs-sm)]">{group.description}</summary><p className="whitespace-pre-wrap">{group.description}</p></details>
        )}
      </Card>

      {group.rules?.trim() && (
        <Card padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)", marginBottom: "var(--space-2)" }}>
            {t("dashboard.rules.title")}
          </h2>
          <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {group.rules}
          </p>
        </Card>
      )}

      <Card data-testid="C1-3" padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.posts.title")}</h2>
          <Text as="span" variant="eyebrow">{t("dashboard.posts.latest")}</Text>
        </div>
        {canPost && (
          <div className="flex items-end mb-4" style={{ gap: "var(--space-2)" }}>
            <textarea data-testid="C1-3-1"
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
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("dashboard.posts.empty")}</p>
        ) : (
          <ul className="space-y-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((post) => (
              <li key={post.id} style={{ padding: "10px 12px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)" }}>
                <div className="flex items-center mb-1" style={{ gap: "var(--space-2)" }}>
                  {post.kind === "announcement" && <Chip style={{ color: "var(--amber)", fontSize: "var(--fs-xs)" }}>{t("dashboard.posts.announcement")}</Chip>}
                  <span className="text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--ink-1)" }}>{post.authorName || t("dashboard.posts.memberFallback")}</span>
                  {post.createdAt > 0 && <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>{new Date(post.createdAt).toLocaleDateString()}</span>}
                </div>
                {editingPostId === post.id ? (
                  <div className="space-y-2">
                    <textarea
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
                    <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.content}</p>
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

      {aggregate && (
        <Card data-testid="C1-1" padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "var(--space-4)" }}>
          <div data-testid="C1-1-1" className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: "var(--space-3)" }}>
            <div>
              <Text as="div" variant="eyebrow">{t("dashboard.identity.lifetimeDistance")}</Text>
              <Text as="div" variant="dataLarge">{(aggregate.lifetimeDistance / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km</Text>
            </div>
            <div>
              <Text as="div" variant="eyebrow">{t("dashboard.identity.rideCount")}</Text>
              <Text as="div" variant="dataLarge">{aggregate.lifetimeRideCount.toLocaleString()} {t("members.rideUnit")}</Text>
            </div>
            <div>
              <Text as="div" variant="eyebrow">{t("dashboard.identity.longestRide")}</Text>
              <Text as="div" variant="dataLarge">{(aggregate.longestRideDistance / 1000).toFixed(1)} km</Text>
            </div>
          </div>
          {(group.monthlyGoalKm ?? 0) > 0 && (
            <div data-testid="C1-1-2" className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center justify-between text-[length:var(--fs-xs)] mb-2" style={{ color: "var(--ink-2)" }}>
                <span>{t("dashboard.monthlyGoal.title", { month: aggregate.monthKey })}</span>
                <span>{(aggregate.monthlyDistance / 1000).toFixed(1)} / {group.monthlyGoalKm?.toLocaleString()} km</span>
              </div>
              <div style={{ height: 8, borderRadius: "var(--r-full)", overflow: "hidden", background: "var(--bg-3)" }}>
                <div style={{ width: `${Math.min(100, aggregate.monthlyDistance / ((group.monthlyGoalKm ?? 1) * 1000) * 100)}%`, height: "100%", background: "var(--lime)" }} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 다가오는 이벤트 */}
      {upcomingEvents.length > 0 && (
        <Card data-testid="C1-4" padding="none" className="mb-5 p-4" style={{ borderRadius: "var(--r-lg)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.upcomingEvents")}</h2>
            <Link data-testid="C1-4-1" to={`/club/${groupId}/events`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreEvents")}</Link>
          </div>
          <ul role="list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--space-2)" }}>
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between" style={{ padding: "10px 12px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", gap: "var(--space-2)" }}>
                <Link to={`/event/${e.id}`} className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{e.name}</div>
                    <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                      {e.startTime ? new Date(e.startTime).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "-"}
                      {e.participantCount != null ? ` · ${t("dashboard.eventParticipants", { count: e.participantCount })}` : ""}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
                  {e.status === "OPEN" && (
                    <Link
                      to={e.myRsvp ? `/event/${e.id}` : `/event/${e.id}/register`}
                      className={buttonClass({ variant: e.myRsvp ? "secondary" : "primary", size: "sm" })}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {e.myRsvp ? t("dashboard.eventAction.manageRsvp") : t("dashboard.eventAction.rsvp")}
                    </Link>
                  )}
                  {e.status === "LIVE" && <Chip style={{ color: "var(--lime)", fontSize: "var(--fs-xs)", whiteSpace: "nowrap" }}>{t("dashboard.eventStatus.live")}</Chip>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* 멤버 랭킹 */}
        <div className="flex-1 min-w-0">
          {/* 최근 그룹 라이드 */}
          {(group.sports ?? [group.discipline ?? "bike"]).includes("bike") && <div className="mt-5">
            <div data-testid="C1-4-2" className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.recentRides")}</h2>
              <Link to={`/club/${groupId}/rides`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreRides")}</Link>
            </div>
            {ridesLoading ? (
              <LoadingSkeleton kind="list" count={3} />
            ) : rides.length === 0 ? (
              <EmptyState icon="🚴" title={t("dashboard.noRides")} compact />
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
        <div className="lg:w-72 flex-shrink-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
          {/* 멤버 미리보기 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.memberPreview")}</h2>
              <Link to={`/club/${groupId}/members`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreMembers")}</Link>
            </div>
            {membersLoading ? (
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
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[length:var(--fs-xs)]"
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
            <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("dashboard.groupInfo")}</h2>
            <dl className="space-y-2 text-[length:var(--fs-sm)]">
              <div className="flex justify-between">
                <dt style={{ color: "var(--ink-2)" }}>{t("memberCount")}</dt>
                <dd className="font-medium" style={{ color: "var(--ink-0)" }}>{t("dashboard.memberCount", { count: group.memberCount })}</dd>
              </div>
              {group.createdAt && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--ink-2)" }}>{t("dashboard.createdDate")}</dt>
                  <dd className="font-medium" style={{ color: "var(--ink-0)" }}>
                    {(() => {
                      const ts = group.createdAt;
                      const d = typeof ts === "number" ? new Date(ts)
                        : ts && typeof ts === "object" && "seconds" in ts ? new Date((ts as { seconds: number }).seconds * 1000)
                        : null;
                      return d ? d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "";
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
