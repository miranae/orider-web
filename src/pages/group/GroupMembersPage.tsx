import { handleGroupChoiceKey } from "../../features/group/groupControlKeys";
import GroupRequestHistory from "../../components/group/GroupRequestHistory";
import { Inbox, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { useToast } from "../../contexts/ToastContext";
import { useGroup, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import { getPublicUserProfiles, type PublicUserProfile } from "../../services/publicProfiles";
import GroupSubNav from "../../components/group/GroupSubNav";
import Avatar from "../../components/Avatar";
import InviteMemberModal from "../../components/group/InviteMemberModal";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card, Chip, Text, DropdownSelect, Input } from "../../theme/components";
import { buildGroupInviteUrl } from "../../features/group/groupInviteLink";
import { useGroupInviteCode } from "../../hooks/useGroupInviteCode";
import { localeTag } from "../../utils/localeDate";
import { normalizeStartTime } from "../../utils/event-time";
import { canManageGroup } from "../../features/group/groupPermissions";
import { setGroupMemberRole, transferGroupLeadership } from "../../features/group/groupLeadership";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import { ICON_SIZE } from "../../theme/tokens/icon";

type Tab = "members" | "pending" | "invite";
type RoleFilter = "all" | "leader" | "co-leader" | "member";

interface PendingRequest {
  userId: string;
  requestedAt: number;
  message?: string;
}

interface InvitationDoc {
  email: string;
  invitedBy: string;
  invitedAt: number;
  status: string;
}

export default function GroupMembersPage({ management = false }: { management?: boolean }) {
  const { t, i18n } = useTranslation("group");
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const leadershipSection = searchParams.get("section") === "leadership";
  const leadershipRef = useRef<HTMLDetailsElement>(null);
  const [leadershipOpen, setLeadershipOpen] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const { user } = useAuth();
  const dialog = useDialog();
  const { showToast } = useToast();
  const navigate = useLocalizedNavigate();
  const { group, loading: groupLoading, error: groupError, retry: retryGroup } = useGroup(groupId);
  const { members, loading: membersLoading, error: membersError, retry: retryMembers } = useGroupMembers(groupId);
  const isOwner = !!user && !!group && user.uid === group.creatorId;
  const activeMembership = members.find(member => member.id === user?.uid && ["active", "approved"].includes(member.status));
  const currentRole = activeMembership?.role ?? null;
  const canManage = canManageGroup(group, user?.uid, currentRole);
  const invite = useGroupInviteCode(canManage ? groupId : undefined, canManage ? user?.uid : undefined);

  const ROLE_LABELS: Record<string, string> = {
    leader: t("members.role.leader"),
    "co-leader": t("members.role.coLeader"),
    member: t("members.role.member"),
  };

  const [tab, setTab] = useState<Tab>("members");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showInvite, setShowInvite] = useState(false);
  const { memberStats } = useGroupRideStats(groupId);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [pendingProfiles, setPendingProfiles] = useState<Map<string, PublicUserProfile>>(new Map());
  const [pendingError, setPendingError] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState(false);
  const [invitationsAttempt, setInvitationsAttempt] = useState(0);
  const [invitations, setInvitations] = useState<InvitationDoc[]>([]);
  const [leaving, setLeaving] = useState(false);
  const leaveIntent = useRef(0);
  useEffect(() => {
    leaveIntent.current += 1; setLeaving(false); setBulkBusy(false); setRoleBusyId(null); setLeadershipBusy(false);
    setSelected(new Set()); setShowInvite(false); setTab("members");
    return () => { leaveIntent.current += 1; };
  }, [groupId, user?.uid, isOwner]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [leadershipTargetId, setLeadershipTargetId] = useState("");
  const [leaveAfterTransfer, setLeaveAfterTransfer] = useState(false);
  const [leadershipBusy, setLeadershipBusy] = useState(false);

  // 멤버 통계는 useGroupRideStats 서버 집계에서 제공한다.

  // 가입 요청 (pending 컬렉션)
  useEffect(() => {
    if (!groupId || !isOwner) { setPending([]); return; }
    let cancelled = false;
    setPendingLoading(true); setPendingError(false);
    let snapshotEpoch = 0;
    const unsubscribe = onSnapshot(
      collection(firestore, "groups", groupId, "pending"),
      (snap) => {
        const epoch = ++snapshotEpoch;
        const list: PendingRequest[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            userId: d.id,
          requestedAt: normalizeStartTime(data.requestedAt),
            message: typeof data.message === "string" ? data.message : undefined,
          };
        });
        setPending(list);
        setPendingLoading(false);

        void getPublicUserProfiles(list.map((item) => item.userId)).then((profiles) => {
          if (!cancelled && epoch === snapshotEpoch) setPendingProfiles(profiles);
        }).catch((err) => {
          logClientError("GroupMembersPage.pendingProfiles", err, { groupId, userCount: list.length });
          if (!cancelled && epoch === snapshotEpoch) setPendingProfiles(new Map());
        });
      },
      (err) => {
        logClientError("GroupMembersPage.pending", err, { groupId });
        if (!cancelled) { setPendingLoading(false); setPendingError(true); }
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupId, isOwner]);

  // Invitation reads use the same active manager predicate as the deployed rules.
  useEffect(() => {
    let cancelled = false;
    setInvitations([]); setInvitationsError(false);
    if (!groupId || tab !== "invite" || !canManage || !activeMembership) return;
    getDocs(collection(firestore, "groups", groupId, "invitations")).then(snapshot => {
      if (!cancelled) setInvitations(snapshot.docs.map(doc => doc.data() as InvitationDoc));
    }).catch(error => {
      logClientError("GroupMembersPage.invitations", error, { groupId });
      if (!cancelled) setInvitationsError(true);
    });
    return () => { cancelled = true; };
  }, [groupId, tab, canManage, !!activeMembership, invitationsAttempt]);

  const isCreator = isOwner;

  useEffect(() => { setLeadershipOpen(false); setRegeneratingCode(false); }, [groupId, user?.uid]);
  useEffect(() => {
    if (!leadershipSection || !isOwner || groupLoading || membersLoading) return;
    setTab("members");
    setLeadershipOpen(true);
    const frame = requestAnimationFrame(() => {
      leadershipRef.current?.scrollIntoView?.({ block: "start" });
      leadershipRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [leadershipSection, isOwner, groupLoading, membersLoading, groupId]);

  const handleRegenerateCode = async () => {
    if (!groupId || !user || !canManage || regeneratingCode) return;
    const intent = leaveIntent.current;
    const uid = user.uid;
    const current = () => intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!(await dialog.confirm(t("settings.confirmRegenerateCode"), {destructive:true})) || !current()) return;
    setRegeneratingCode(true);
    try {
      const applied = await invite.regenerate();
      if (applied && current()) showToast(t("settings.regenerateCodeSuccess"));
    } catch (error) {
      if (!current()) return;
      logClientError("GroupMembersPage.regenerateInvite", error, {groupId});
      showToast(t("settings.regenerateCodeFailed"), "error");
    } finally { if (current()) setRegeneratingCode(false); }
  };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const role = (m.role as string) ?? "member";
      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (q && !(m.profile?.nickname ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, search, roleFilter]);

  const selectableMemberIds = useMemo(
    () => filteredMembers.filter((m) => m.id !== user?.uid).map((m) => m.id),
    [filteredMembers, user?.uid],
  );

  const leadershipCandidates = useMemo(
    () => members.filter((member) =>
      member.id !== user?.uid
      && ["active", "approved"].includes(String(member.status ?? ""))
      && ["member", "co-leader", "leader"].includes(String(member.role ?? "member"))),
    [members, user?.uid],
  );

  useEffect(() => {
    if (!leadershipCandidates.some((member) => member.id === leadershipTargetId)) {
      setLeadershipTargetId(leadershipCandidates[0]?.id ?? "");
    }
  }, [leadershipCandidates, leadershipTargetId]);

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkRemove = async () => {
    const targetIds = Array.from(selected).filter((id) => id !== user?.uid);
    if (!groupId || !isCreator || targetIds.length === 0) return;
    const uid = user?.uid;
    const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;

    if (!(await dialog.confirm(t("members.confirmBulkRemove", { count: targetIds.length }), { destructive: true })) || !current()) return;
    setBulkBusy(true);
    try {
      const removeFn = httpsCallable(functions, "removeGroupMember");
      let failed = 0;
      for (const targetUserId of targetIds) {
        if (!current()) return;
        try {
          await removeFn({ groupId, targetUserId });
        } catch (err) {
          if (!current()) return;
          failed += 1;
          logClientError("GroupMembersPage.handleBulkRemove", err, { groupId, targetUserId });
        }
      }
      if (!current()) return;
      setSelected(new Set());
      if (failed > 0) {
        showToast(t("members.removePartialFailed", { failed, total: targetIds.length }), "error");
      } else {
        showToast(t("members.removeSuccess", { count: targetIds.length }));
      }
    } finally {
      if (current()) setBulkBusy(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string, name: string) => {
    if (!groupId || !isCreator || targetUserId === user?.uid) return;
    const uid = user?.uid;
    const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;

    if (!(await dialog.confirm(t("members.confirmRemove", { name }), { destructive: true })) || !current()) return;
    setBulkBusy(true);
    try {
      const removeFn = httpsCallable(functions, "removeGroupMember");
      await removeFn({ groupId, targetUserId });
      if (!current()) return;
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
      showToast(t("members.removeOneSuccess", { name }));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupMembersPage.handleRemoveMember", err, { groupId, targetUserId });
      showToast(t("members.removeFailed"), "error");
    } finally {
      if (current()) setBulkBusy(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, name: string, currentRole: string) => {
    if (
      !groupId ||
      !isCreator ||
      targetUserId === user?.uid ||
      targetUserId === group.creatorId ||
      currentRole === "leader" ||
      (currentRole !== "member" && currentRole !== "co-leader")
    ) return;

    const uid = user?.uid;
    const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;
    const nextRole = currentRole === "co-leader" ? "member" : "co-leader";
    const confirmed = await dialog.confirm(t(
      nextRole === "co-leader" ? "members.confirmPromote" : "members.confirmDemote",
      { name },
    ));
    if (!confirmed || !current()) return;

    setRoleBusyId(targetUserId);
    try {
      // #379: 서버(CF)가 creator 권한·대상 유효성·updatedAt 을 강제 — 직접 쓰기 제거.
      await setGroupMemberRole({ groupId, userId: targetUserId, role: nextRole });
      if (!current()) return;
      showToast(t(nextRole === "co-leader" ? "members.promoteSuccess" : "members.demoteSuccess", { name }));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupMembersPage.handleRoleChange", err, { groupId, targetUserId, nextRole });
      showToast(t("members.roleChangeFailed"), "error");
    } finally {
      if (current()) setRoleBusyId(null);
    }
  };

  const handleLeadershipTransfer = async () => {
    if (!groupId || !isCreator || !leadershipTargetId || leadershipBusy) return;
    const target = leadershipCandidates.find((member) => member.id === leadershipTargetId);
    if (!target) return;
    const name = target.profile?.nickname ?? target.id;
    const uid = user?.uid;
    const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;

    if (!(await dialog.confirm(t(
      leaveAfterTransfer ? "members.leadership.confirmAndLeave" : "members.leadership.confirm",
      { name },
    ), { destructive: leaveAfterTransfer })) || !current()) return;

    setLeadershipBusy(true);
    try {
      const result = await transferGroupLeadership({
        groupId,
        targetUserId: target.id,
        leaveAfterTransfer,
      });
      if (!current()) return;
      showToast(t(result.leftGroup
        ? "members.leadership.transferAndLeaveSuccess"
        : "members.leadership.transferSuccess", { name }));
      navigate(result.leftGroup ? "/clubs" : `/club/${groupId}`, { replace: true });
    } catch (err) {
      if (!current()) return;
      logClientError("GroupMembersPage.handleLeadershipTransfer", err, {
        groupId,
        targetUserId: target.id,
        leaveAfterTransfer,
      });
      showToast(t("members.leadership.transferFailed"), "error");
    } finally {
      if (current()) setLeadershipBusy(false);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!groupId) return;
    const uid = user?.uid;
    const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;

    try {
      // approveGroupRequest CF가 멤버 추가 + pending 삭제를 원자적으로 처리.
      // CF 미존재 시 클라이언트가 멤버 doc만 삭제하면 가입 안 된 채 요청만 사라지므로 fallback 없음.
      const fn = httpsCallable(functions, "approveGroupRequest");
      await fn({ groupId, userId });
      if (!current()) return;
      setPending((prev) => prev.filter((p) => p.userId !== userId));
      showToast(t("members.approveSuccess"));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupMembersPage.handleApprove", err, { groupId, userId });
      void dialog.alert(err instanceof Error ? err.message : t("error.approveFailed"), { variant: "danger" });
    }
  };

  const handleReject = async (userId: string) => {
    if (!groupId) return;
    const uid = user?.uid; const intent = leaveIntent.current;
    const current = () => !!uid && intent === leaveIntent.current && auth.currentUser?.uid === uid;
    if (!current()) return;
    try {
      await ensureAppCheckReady();
      if (!current()) return;
      await httpsCallable(functions, "rejectGroupRequest")({ groupId, userId });
      if (!current()) return;
      setPending((prev) => prev.filter((p) => p.userId !== userId));
      showToast(t("members.rejectSuccess"));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupMembersPage.handleReject", err, { groupId, userId });
      showToast(t("members.rejectFailed"), "error");
    }
  };

  if (groupLoading) {
    return (
      <div className="py-6">
        <LoadingSkeleton kind="list" count={5} />
      </div>
    );
  }

  if (groupError) return <ErrorState title={t("error.loadFailed")} onRetry={retryGroup} />;

  if (!group) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<Users size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
          title={t("empty.groupNotFound")}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
        />
      </div>
    );
  }

  return (
    <div className="club-surface club-members">
      {!management && <GroupSubNav group={group} isCreator={canManageGroup(group, user?.uid, members.find(member => member.id === user?.uid && ["active", "approved"].includes(member.status))?.role ?? null)} />}

      {!management && !isOwner && user && members.some(member => member.id === user.uid) && <details data-testid="C6-0-3"><summary aria-label={t("members.menu")}>⋯</summary><Button variant="danger" disabled={leaving} onClick={async () => {
        if (!groupId || !user || leaving) return;
        const uid = user.uid;
        const intent = leaveIntent.current;
        if (!(await dialog.confirm(t("settings.leaveDescription"), { destructive: true }))) return;
        if (leaveIntent.current !== intent || auth.currentUser?.uid !== uid) return;
        setLeaving(true);
        try {
          await ensureAppCheckReady();
          if (leaveIntent.current !== intent || auth.currentUser?.uid !== uid) return;
          await httpsCallable(functions, "leaveGroup")({ groupId });
          if (leaveIntent.current !== intent || auth.currentUser?.uid !== uid) return;
          showToast(t("settings.leaveSuccess")); navigate("/clubs");
        } catch (error) {
          if (leaveIntent.current !== intent || auth.currentUser?.uid !== uid) return;
          logClientError("GroupMembersPage.leave", error, { groupId }); showToast(t("error.leaveFailed"), "error");
        } finally { if (leaveIntent.current === intent) setLeaving(false); }
      }}>{t("button.leave")}</Button></details>}

      {/* Tabs */}
      <div data-testid="C6-0" role="tablist" onKeyDown={event=>handleGroupChoiceKey(event,"tab")} aria-label={t("breadcrumb.memberManagement")} className="flex items-center" style={{ gap: "var(--space-0-5)", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-4)' }}>
        {([
          ["members", `${t("members.tab.members")} ${members.length}`],
          ...(isCreator ? [["pending", `${t("members.tab.pending")} ${pending.length}`] as [Tab, string]] : []),
          ...(canManage ? [["invite", t("members.tab.invite")] as [Tab, string]] : []),
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            data-testid={id === "members" ? "C6-0-1" : undefined}
            type="button"
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            id={`club-${groupId}-tab-${id}`}
            aria-controls={`club-${groupId}-panel-${id}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: "var(--space-3) var(--space-4)",
              fontSize: "var(--ft-body-size)",
              fontWeight: 500,
              color: tab === id ? "var(--ink-0)" : "var(--ink-3)",
              borderBottom: tab === id ? "2px solid var(--lime)" : "2px solid transparent",
              marginBottom: -1,
              background: "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {pendingError && <p role="alert">{t("error.loadFailed")}</p>}
      {/* MEMBERS TAB */}
      {tab === "members" && (
        <section role="tabpanel" id={`club-${groupId}-panel-members`} aria-labelledby={`club-${groupId}-tab-members`}>
          {/* Toolbar */}
          <div data-testid="C6-1" className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <Input data-testid="C6-1-1"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.member")}
              aria-label={t("search.member")}
              className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
              style={{ flex: "1 1 200px", background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
            />
            <DropdownSelect value={roleFilter} onChange={value => setRoleFilter(value as RoleFilter)} label={t("filter.roles")} options={[{ value: "all", label: t("filter.roles") }, { value: "leader", label: t("members.role.leader") }, { value: "co-leader", label: t("members.role.coLeader") }, { value: "member", label: t("members.role.member") }]} />
            {selected.size > 0 && isCreator && (
              <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
                <span className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)" }}>{selected.size}{t("members.selectedCount")}</span>
                <Button
                  type="button"
                  onClick={handleBulkRemove}
                  disabled={bulkBusy} variant="secondary" size="sm"
                  style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)" }}
                >
                  {bulkBusy ? t("button.saving") : t("button.remove")}
                </Button>
              </div>
            )}
            <div style={{ flex: 1 }} />
            {canManage && <Button data-testid="C6-0-2" onClick={() => setTab("invite")} variant="primary" size="sm">{t("button.invite")}</Button>}
          </div>

          {Boolean(membersError) && <ErrorState title={t("error.membersLoadFailed")} onRetry={retryMembers} compact />}
          {membersLoading ? (
            <LoadingSkeleton kind="list" count={5} />
          ) : membersError && members.length === 0 ? null : filteredMembers.length === 0 ? (
            <EmptyState icon={<Search size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />} title={t("empty.noMembers")} compact />
          ) : (
            <><p className="club-table-hint" id={management ? "club-management-table-hint" : "club-members-table-hint"}>{t("members.table.scrollHint")}</p><Card data-testid={management ? "C7-2" : "C6-2"} role="region" aria-label={t("breadcrumb.memberManagement")} aria-describedby={management ? "club-management-table-hint" : "club-members-table-hint"} tabIndex={0} className="club-members-table" padding="none" style={{ padding: 0, overflowX: "auto" }}>
              {/* Header */}
              <div className="club-members-row club-members-row--header"
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom: "1px solid var(--line-soft)",
                  background: "var(--bg-1)",
                  fontSize: "var(--ft-body-size)",
                  color: "var(--ink-3)",
                  fontWeight: 500,
                }}
              >
                <div>
                  {isCreator && (
                    <input
                      type="checkbox"
                      checked={selectableMemberIds.length > 0 && selected.size === selectableMemberIds.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(selectableMemberIds) : new Set())}
                      aria-label={t("members.selectAll")}
                    />
                  )}
                </div>
                <div>{t("members.table.name")}</div>
                <div>{t("members.table.role")}</div>
                <div>{t("members.table.joinedDate")}</div>
                <div style={{ textAlign: "right" }}>{t("members.table.distanceRides")}</div>
                <div>{t("members.table.actions")}</div>
              </div>

              {filteredMembers.map((m) => {
                const stats = memberStats[m.id];
                const role = (m.role as string) ?? (group.creatorId === m.id ? "leader" : "member");
                const joinedAt = normalizeStartTime(m.joinedAt);
                const joinDate = joinedAt
                  ? new Date(joinedAt).toLocaleDateString(localeTag(), { year: "2-digit", month: "numeric", day: "numeric" })
                  : "—";
                const isMe = m.id === user?.uid;
                return (
                  <div className="club-members-row"
                    key={m.id}
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      alignItems: "center",
                      borderTop: "1px solid var(--line-soft)",
                      background: isMe ? "color-mix(in oklch, var(--lime) 4%, var(--bg-1))" : "transparent",
                    }}
                  >
                    <div>
                      {isCreator && !isMe && (
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleSel(m.id)}
                          aria-label={t("members.selectMember", { name: m.profile?.nickname ?? m.id })}
                        />
                      )}
                    </div>
                    <Link data-testid="C6-2-1" to={`/athlete/${m.id}`} className="flex items-center min-w-0" style={{ gap: 'var(--space-2)' }}>
                      <Avatar name={m.profile?.nickname ?? "?"} imageUrl={m.profile?.photoURL} size="sm" />
                      <Text variant="bodyMedium" truncate tone="primary">
                        {m.profile?.nickname ?? m.id}
                      </Text>
                      {isMe && <Chip style={{ fontSize: "var(--fs-2xs)", color: "var(--lime)" }}>{t("members.self")}</Chip>}
                    </Link>
                    <div className="text-[length:var(--ft-body-size)]" style={{ color: role === "leader" ? "var(--lime)" : role === "co-leader" ? "var(--aqua)" : "var(--ink-2)" }}>
                      {ROLE_LABELS[role] ?? role}
                    </div>
                    <Text as="div" variant="num" className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)" }}>{joinDate}</Text>
                    <Text as="div" variant="num" className="text-[length:var(--ft-body-size)] text-right" style={{ color: "var(--ink-1)" }}>
                      {stats ? `${(stats.distance / 1000).toFixed(0)}km · ${stats.rideCount}${t("members.rideUnit")}` : "—"}
                    </Text>
                    <div className="club-member-actions">
                      {isCreator && !isMe && m.id !== group.creatorId && role !== "leader" && (role === "member" || role === "co-leader") && (
                        <>
                          <Button data-testid="C7-2-1"
                            type="button"
                            onClick={() => void handleRoleChange(m.id, m.profile?.nickname ?? m.id, role)}
                            disabled={roleBusyId === m.id || bulkBusy}
                            aria-label={t(
                              role === "co-leader" ? "members.action.demoteAria" : "members.action.promoteAria",
                              { name: m.profile?.nickname ?? m.id },
                            )}
                            variant="secondary"
                            size="sm"
                          >
                            {roleBusyId === m.id
                              ? t("button.saving")
                              : t(role === "co-leader" ? "members.action.demote" : "members.action.promote")}
                          </Button>
                          <Button data-testid="C7-2-2"
                            type="button"
                            onClick={() => void handleRemoveMember(m.id, m.profile?.nickname ?? m.id)}
                            disabled={bulkBusy || roleBusyId === m.id}
                            variant="secondary"
                            size="sm"
                            style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)" }}
                          >
                            {t("button.remove")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card></>
          )}
          {isCreator && (
            <Card data-testid="C7-3" padding="none" className="mt-5 mb-4" style={{ padding: "var(--space-4)" }}>
              <details ref={leadershipRef} id="club-leadership" className="club-leadership-details" tabIndex={-1} open={leadershipOpen} onToggle={event=>setLeadershipOpen(event.currentTarget.open)}>
                <summary>{t("members.leadership.title")}</summary><div className="mt-4">
              <p className="text-[length:var(--ft-body-size)] mt-1 mb-3" style={{ color: "var(--ink-3)" }}>
                {t("members.leadership.desc")}
              </p>
              {leadershipCandidates.length === 0 ? (
                <Text as="p" variant="body" tone="tertiary">{t("members.leadership.noEligibleMember")}</Text>
              ) : (
                <div className="flex items-end flex-wrap" style={{ gap: "var(--space-3)" }}>
                  <label className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)" }}>
                    <span className="block mb-1">{t("members.leadership.target")}</span>
                    <DropdownSelect value={leadershipTargetId} onChange={setLeadershipTargetId} disabled={leadershipBusy} className="club-leadership-select" label={t("members.leadership.target")} options={leadershipCandidates.map(member => ({ value: member.id, label: `${member.profile?.nickname ?? member.id}${member.role === "co-leader" ? ` · ${t("members.role.coLeader")}` : ""}` }))} />
                  </label>
                  <label className="flex items-center text-[length:var(--ft-body-size)]" style={{ gap: "var(--space-2)", color: "var(--ink-2)" }}>
                    <input
                      type="checkbox"
                      checked={leaveAfterTransfer}
                      onChange={(event) => setLeaveAfterTransfer(event.target.checked)}
                      disabled={leadershipBusy}
                    />
                    {t("members.leadership.leaveAfterTransfer")}
                  </label>
                  <Button data-testid="C7-3-1"
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!leadershipTargetId || leadershipBusy}
                    onClick={() => { void handleLeadershipTransfer(); }}
                    style={{ color: "var(--amber)" }}
                  >
                    {leadershipBusy ? t("button.saving") : t("members.leadership.transfer")}
                  </Button>
                </div>
              )}
              </div></details>
            </Card>
          )}
        </section>
      )}

      {/* PENDING TAB */}
      {tab === "pending" && (
        <section role="tabpanel" id={`club-${groupId}-panel-pending`} aria-labelledby={`club-${groupId}-tab-pending`}>
          {pendingLoading ? (
            <LoadingSkeleton kind="list" count={3} />
          ) : pending.length === 0 ? (
            <EmptyState icon={<Inbox size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />} title={t("empty.noPendingRequests")} description={t("members.pendingDesc")} compact />
          ) : (
            <Card data-testid="C7-1" padding="none" style={{ padding: 0 }}>
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {pending.map((p) => {
                  const profile = pendingProfiles.get(p.userId) ?? null;
                  const name = profile?.nickname ?? t("members.unknownRequester");
                  return (
                    <li
                      key={p.userId}
                      className="flex items-center justify-between flex-wrap"
                      style={{ gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}
                    >
                      <div className="min-w-0 flex items-center" style={{ gap: "var(--space-2)" }}>
                        <Avatar name={name} imageUrl={profile?.photoURL} size="sm" />
                        <div className="min-w-0">
                          <div className="text-[length:var(--ft-body-medium-size)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{name}</div>
                          <div className="text-[length:var(--ft-body-size)] mt-0.5 truncate" style={{ color: "var(--ink-3)" }}>
                            {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString(localeTag()) : ""}
                            {p.message && ` · "${p.message}"`}
                            {!profile && ` · ${p.userId.slice(0, 8)}`}
                          </div>
                        </div>
                      </div>
                      {isCreator && (
                        <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
                          <Button data-testid="C7-1-1" type="button" onClick={() => handleApprove(p.userId)} variant="primary" size="sm">{t("button.approve")}</Button>
                          <Button type="button" onClick={() => handleReject(p.userId)} variant="secondary" size="sm" style={{ color: "var(--rose)" }}>{t("button.reject")}</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {isOwner && <GroupRequestHistory groupId={groupId} />}
        </section>
      )}

      {/* INVITE TAB */}
      {tab === "invite" && canManage && (
        <Card role="tabpanel" id={`club-${groupId}-panel-invite`} aria-labelledby={`club-${groupId}-tab-invite`} data-testid="C6-3" padding="none" style={{ padding: 'var(--space-4)' }}>
          <h2 className="text-[length:var(--ft-title-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("members.inviteLink")}</h2>
          {invite.status === "failed" ? <div className="club-invite-load-error mb-4" role="alert"><Text as="p" variant="body">{t("invite.linkLoadFailed")}</Text><Button variant="secondary" size="sm" onClick={()=>{ invite.retry(); setInvitationsAttempt(value=>value+1); }}>{t("invite.retry")}</Button></div> : invite.code ? <>
          <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <code style={{ padding: "var(--space-2) var(--space-3)", background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", fontFamily: "var(--font-code)", color: "var(--lime)", flex: 1, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {invite.code ? buildGroupInviteUrl(invite.code, i18n.language) : ""}
            </code>
            <Button data-testid="C6-3-1"
              type="button"
              disabled={!invite.code}
              onClick={async () => {
                if (!invite.code) return;
                try {
                  await navigator.clipboard.writeText(buildGroupInviteUrl(invite.code, i18n.language));
                } catch (err) {
                  logClientError("GroupMembersPage.copyInvite", err, { groupId });
                  return;
                }
                setInviteLinkCopied(true);
                setTimeout(() => setInviteLinkCopied(false), 2000);
              }} variant="secondary" size="sm"
            >
              {inviteLinkCopied ? t("invite.copied") : t("button.copy")}
            </Button>
          </div>
          </> : <p role="status" className="mb-4">{t(`invite.${invite.status}`)}</p>}
          <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
            {t("members.inviteCodeDesc")}
          </p>

          {invite.details && <p className="mb-4" data-testid="C6-3-lifecycle">{t("settings.inviteLifecycle", {date: new Date(invite.details.expiresAt).toLocaleDateString(localeTag()),used:invite.details.useCount,limit:invite.details.useLimit})}</p>}
          <div className="flex flex-wrap gap-2 mb-4"><Button data-testid="C6-3-regenerate" onClick={handleRegenerateCode} disabled={regeneratingCode || invite.status === "loading"} variant="secondary" size="sm">{regeneratingCode ? t("button.saving") : t("button.regenerateCode")}</Button>
          <Button onClick={() => setShowInvite(true)} variant="secondary" size="sm">{t("invite.directLabel")}</Button></div>
          {invitationsError && invite.status !== "failed" && <div role="alert" className="club-invite-load-error mb-4"><Text as="p" variant="body">{t("invite.historyLoadFailed")}</Text><Button variant="secondary" size="sm" onClick={()=>setInvitationsAttempt(value=>value+1)}>{t("invite.retry")}</Button></div>}
          {invitations.length > 0 && (
            <div data-testid="C6-3-2">
              <h3 className="text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-1)", marginBottom: 'var(--space-2)' }}>{t("members.sentInvitations")}</h3>
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {invitations.map((inv, i) => (
                  <li key={i} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "1px dashed var(--line-soft)", fontSize: "var(--ft-body-size)" }}>
                    <span style={{ color: "var(--ink-1)" }}>{inv.email}</span>
                    <Chip style={{ fontSize: "var(--fs-2xs)", color: inv.status === "accepted" ? "var(--lime)" : "var(--ink-3)" }}>
                      {inv.status === "accepted" ? t("members.invitationStatus.accepted") : t("members.invitationStatus.pending")}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <InviteMemberModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        groupId={groupId!}
        inviteCode={invite.code}
        inviteStatus={invite.status}
        onRetry={invite.retry}
      />
    </div>
  );
}
