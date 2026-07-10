import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { collection, getDocs, deleteDoc, doc as fsDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { useGroup, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import GroupSubNav from "../../components/group/GroupSubNav";
import Avatar from "../../components/Avatar";
import InviteMemberModal from "../../components/group/InviteMemberModal";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card, Chip, Text } from "../../theme/components";
import { buildGroupInviteUrl } from "../../features/group/groupInviteLink";

type Tab = "members" | "pending" | "invite" | "banned";
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

export default function GroupMembersPage() {
  const { t, i18n } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const dialog = useDialog();
  const { group, loading: groupLoading } = useGroup(groupId);
  const { members, loading: membersLoading } = useGroupMembers(groupId);

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
  const [pendingLoading, setPendingLoading] = useState(false);
  const [invitations, setInvitations] = useState<InvitationDoc[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  // 멤버 통계는 useGroupRideStats 서버 집계에서 제공한다.

  // 가입 요청 (pending 컬렉션)
  useEffect(() => {
    if (!groupId || tab !== "pending") return;
    setPendingLoading(true);
    (async () => {
      try {
        const snap = await getDocs(collection(firestore, "groups", groupId, "pending"));
        const list: PendingRequest[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            userId: d.id,
            requestedAt: typeof data.requestedAt === "number" ? data.requestedAt : 0,
            message: data.message,
          };
        });
        setPending(list);
      } catch {
        setPending([]);
      } finally {
        setPendingLoading(false);
      }
    })();
  }, [groupId, tab]);

  // 초대 발송 내역
  useEffect(() => {
    if (!groupId || tab !== "invite") return;
    (async () => {
      try {
        const snap = await getDocs(collection(firestore, "groups", groupId, "invitations"));
        const list: InvitationDoc[] = snap.docs.map((d) => d.data() as InvitationDoc);
        setInvitations(list);
      } catch {
        setInvitations([]);
      }
    })();
  }, [groupId, tab]);

  const isCreator = !!user && !!group && user.uid === group.creatorId;

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
    if (!(await dialog.confirm(t("members.confirmBulkRemove", { count: targetIds.length }), { destructive: true }))) return;
    setBulkBusy(true);
    try {
      const removeFn = httpsCallable(functions, "removeGroupMember");
      for (const targetUserId of targetIds) {
        try {
          await removeFn({ groupId, targetUserId });
        } catch (err) {
          logClientError("GroupMembersPage.handleBulkRemove", err, { groupId, targetUserId });
        }
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!groupId) return;
    try {
      // approveGroupRequest CF가 멤버 추가 + pending 삭제를 원자적으로 처리.
      // CF 미존재 시 클라이언트가 멤버 doc만 삭제하면 가입 안 된 채 요청만 사라지므로 fallback 없음.
      const fn = httpsCallable(functions, "approveGroupRequest");
      await fn({ groupId, userId });
      setPending((prev) => prev.filter((p) => p.userId !== userId));
    } catch (err) {
      logClientError("GroupMembersPage.handleApprove", err, { groupId, userId });
      void dialog.alert(err instanceof Error ? err.message : t("error.approveFailed"), { variant: "danger" });
    }
  };

  const handleReject = async (userId: string) => {
    if (!groupId) return;
    try {
      await deleteDoc(fsDoc(firestore, "groups", groupId, "pending", userId));
      setPending((prev) => prev.filter((p) => p.userId !== userId));
    } catch (err) {
      logClientError("GroupMembersPage.handleReject", err, { groupId, userId });
    }
  };

  if (groupLoading || !group) {
    return (
      <div className="py-6">
        <LoadingSkeleton kind="list" count={5} />
      </div>
    );
  }

  return (
    <div>
      <GroupSubNav group={group} isCreator={isCreator} />

      {/* Breadcrumb */}
      <div className="text-[length:var(--fs-xs)] flex items-center" style={{ gap: "var(--space-1-5)", marginBottom: 'var(--space-3)', color: "var(--ink-3)" }}>
        <Link to="/groups" style={{ color: "var(--ink-3)" }}>{t("breadcrumb.groups")}</Link>
        <span style={{ color: "var(--ink-4)" }}>/</span>
        <Link to={`/group/${groupId}`} style={{ color: "var(--ink-1)", fontWeight: 500 }}>{group.name}</Link>
        <span style={{ color: "var(--ink-4)" }}>/</span>
        <span style={{ color: "var(--ink-0)" }}>{t("breadcrumb.memberManagement")}</span>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label={t("breadcrumb.memberManagement")} className="flex items-center" style={{ gap: "var(--space-0-5)", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-4)' }}>
        {([
          ["members", `${t("members.tab.members")} ${members.length}`],
          ["pending", `${t("members.tab.pending")} ${pending.length}`],
          ["invite", t("members.tab.invite")],
          ["banned", t("members.tab.banned")],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: "10px 14px",
              fontSize: "var(--fs-xs)",
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

      {/* MEMBERS TAB */}
      {tab === "members" && (
        <>
          {/* Toolbar */}
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.member")}
              aria-label={t("search.member")}
              className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
              style={{ flex: "1 1 200px", background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              aria-label={t("filter.roles")}
              className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
            >
              <option value="all">{t("filter.roles")}</option>
              <option value="leader">{t("members.role.leader")}</option>
              <option value="co-leader">{t("members.role.coLeader")}</option>
              <option value="member">{t("members.role.member")}</option>
            </select>
            {selected.size > 0 && isCreator && (
              <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
                <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{selected.size}{t("members.selectedCount")}</span>
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
            <Button onClick={() => setShowInvite(true)} variant="primary" size="sm">{t("button.invite")}</Button>
          </div>

          {membersLoading ? (
            <LoadingSkeleton kind="list" count={5} />
          ) : filteredMembers.length === 0 ? (
            <EmptyState icon="🔍" title={t("empty.noMembers")} compact />
          ) : (
            <Card padding="none" className="overflow-hidden" style={{ padding: 0 }}>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr 100px 110px 120px 36px",
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line-soft)",
                  background: "var(--bg-1)",
                  fontSize: "var(--fs-xs)",
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
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
                <div />
              </div>

              {filteredMembers.map((m) => {
                const stats = memberStats[m.id];
                const role = (m.role as string) ?? (group.creatorId === m.id ? "leader" : "member");
                const joinDate = new Date(m.joinedAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" });
                const isMe = m.id === user?.uid;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "32px 1fr 100px 110px 120px 36px",
                      padding: "12px 14px",
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
                    <Link to={`/athlete/${m.id}`} className="flex items-center min-w-0" style={{ gap: 'var(--space-2)' }}>
                      <Avatar name={m.profile?.nickname ?? "?"} imageUrl={m.profile?.photoURL} size="sm" />
                      <span className="text-[length:var(--fs-sm)] font-medium truncate" style={{ color: "var(--ink-0)" }}>
                        {m.profile?.nickname ?? m.id}
                      </span>
                      {isMe && <Chip style={{ fontSize: "var(--fs-2xs)", color: "var(--lime)" }}>{t("members.self")}</Chip>}
                    </Link>
                    <div className="text-[length:var(--fs-xs)]" style={{ color: role === "leader" ? "var(--lime)" : role === "co-leader" ? "var(--aqua)" : "var(--ink-2)" }}>
                      {ROLE_LABELS[role] ?? role}
                    </div>
                    <Text as="div" variant="num" className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{joinDate}</Text>
                    <Text as="div" variant="num" className="text-[length:var(--fs-xs)] text-right" style={{ color: "var(--ink-1)" }}>
                      {stats ? `${(stats.distance / 1000).toFixed(0)}km · ${stats.rideCount}${t("members.rideUnit")}` : "—"}
                    </Text>
                    <div />
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {/* PENDING TAB */}
      {tab === "pending" && (
        <>
          {pendingLoading ? (
            <LoadingSkeleton kind="list" count={3} />
          ) : pending.length === 0 ? (
            <EmptyState icon="📭" title={t("empty.noPendingRequests")} description={t("members.pendingDesc")} compact />
          ) : (
            <Card padding="none" style={{ padding: 0 }}>
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {pending.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between"
                    style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{p.userId.slice(0, 12)}…</div>
                      <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                        {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString("ko-KR") : ""}
                        {p.message && ` · "${p.message}"`}
                      </div>
                    </div>
                    {isCreator && (
                      <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
                        <Button type="button" onClick={() => handleApprove(p.userId)} variant="primary" size="sm">{t("button.approve")}</Button>
                        <Button type="button" onClick={() => handleReject(p.userId)} variant="secondary" size="sm" style={{ color: "var(--rose)" }}>{t("button.reject")}</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* INVITE TAB */}
      {tab === "invite" && (
        <Card padding="none" style={{ padding: 'var(--space-4)' }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("members.inviteLink")}</h2>
          <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <code style={{ padding: "var(--space-2) var(--space-3)", background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", fontFamily: "var(--font-mono)", color: "var(--lime)", flex: 1 }}>
              {buildGroupInviteUrl(group.inviteCode, i18n.language)}
            </code>
            <Button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(buildGroupInviteUrl(group.inviteCode, i18n.language));
                setInviteLinkCopied(true);
                setTimeout(() => setInviteLinkCopied(false), 2000);
              }} variant="secondary" size="sm"
            >
              {inviteLinkCopied ? t("invite.copied") : t("button.copy")}
            </Button>
          </div>
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
            {t("members.inviteCodeDesc")}
          </p>

          {invitations.length > 0 && (
            <div>
              <h3 className="text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--ink-1)", marginBottom: 'var(--space-2)' }}>{t("members.sentInvitations")}</h3>
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {invitations.map((inv, i) => (
                  <li key={i} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "1px dashed var(--line-soft)", fontSize: "var(--fs-xs)" }}>
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

      {/* BANNED TAB */}
      {tab === "banned" && (
        <EmptyState icon="🚫" title={t("empty.noBlockedUsers")} description={t("members.blockedFuture")} compact />
      )}

      <InviteMemberModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        groupId={groupId!}
        inviteCode={group.inviteCode}
      />
    </div>
  );
}
