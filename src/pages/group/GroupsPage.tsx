import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useMyGroups, usePublicGroups } from "../../hooks/useGroup";
import { useGroupNextEvents } from "../../hooks/useGroupNextEvents";
import GroupCard from "../../components/group/GroupCard";
import CreateGroupModal from "../../components/group/CreateGroupModal";
import { EmptyState, LoadingSkeleton, PageHeader, PermissionGate } from "../../components/redesign";
import { Button } from "../../theme/components";

export default function GroupsPage() {
  const { t } = useTranslation("group");
  const { user } = useAuth();
  const { groups: myGroups, loading: myLoading } = useMyGroups(user?.uid);
  const { groups: publicGroups, loading: publicLoading } = usePublicGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joiningPublic, setJoiningPublic] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState<"ALL" | "bike" | "run" | "swim" | "tri">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const myGroupIds = new Set(myGroups.map((g) => g.id));
  const myGroupIdList = useMemo(() => myGroups.map((g) => g.id), [myGroups]);
  const { byGroup: nextEventLabels } = useGroupNextEvents(myGroupIdList);

  const filterGroups = <T extends { name: string; discipline?: string }>(list: T[]): T[] => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((g) => {
      if (disciplineFilter !== "ALL" && (g.discipline ?? "bike") !== disciplineFilter) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const filteredMyGroups = useMemo(() => filterGroups(myGroups), [myGroups, disciplineFilter, searchQuery]);
  const filteredPublicGroups = useMemo(
    () => filterGroups(publicGroups.filter((g) => !myGroupIds.has(g.id))),
    [publicGroups, myGroupIds, disciplineFilter, searchQuery]
  );

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setError("");
    try {
      const joinFn = httpsCallable<{ inviteCode: string }, { groupId: string }>(functions, "joinGroupByCode");
      const result = await joinFn({ inviteCode: inviteCode.trim() });
      navigate(`/group/${result.data.groupId}`);
    } catch (err: any) {
      setError(err.message === "Invalid invite code" ? t("error.invalidInviteCode") : t("error.joinFailed"));
    }
    setJoining(false);
  };

  const handleJoinPublic = async (groupId: string) => {
    setJoiningPublic(groupId);
    try {
      const joinFn = httpsCallable(functions, "joinGroupPublic");
      await joinFn({ groupId });
      navigate(`/group/${groupId}`);
    } catch {
      setError(t("error.joinFailed"));
    }
    setJoiningPublic(null);
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("error.loginRequired")} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("title")}
        title={t("myGroups")}
        subtitle={t("list.groupCount", { count: myGroups.length })}
        right={
          <Button onClick={() => setShowCreate(true)} variant="primary" size="sm">
            {t("button.create")}
          </Button>
        }
      />

      {/* 검색 + 종목 필터 */}
      <div className="flex items-center flex-wrap mb-4" style={{ gap: 'var(--space-2)' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.groupName")}
          aria-label={t("search.groupName")}
          className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
          style={{ flex: "1 1 200px", background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
        />
        <div role="group" aria-label={t("filter.all")} className="flex items-center flex-wrap" style={{ gap: 'var(--space-1)' }}>
          {[
            { v: "ALL" as const, label: t("filter.all") },
            { v: "bike" as const, label: t("filter.bike") },
            { v: "run" as const, label: t("filter.run") },
            { v: "swim" as const, label: t("filter.swim") },
            { v: "tri" as const, label: t("filter.tri") },
          ].map((o) => {
            const active = disciplineFilter === o.v;
            return (
              <Button
                key={o.v}
                type="button"
                onClick={() => setDisciplineFilter(o.v)}
                aria-pressed={active} variant="secondary" size="sm"
                style={{
                  background: active ? "var(--bg-3)" : "transparent",
                  color: active ? "var(--ink-0)" : "var(--ink-3)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      </div>

      {myLoading ? (
        <div className="mb-8">
          <LoadingSkeleton kind="list" count={3} />
        </div>
      ) : filteredMyGroups.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon="👥"
            title={myGroups.length === 0 ? t("empty.noGroups") : t("list.noGroupsFiltered")}
            description={myGroups.length === 0 ? t("list.noGroupsDesc") : t("list.noGroupsFilteredDesc")}
            compact
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filteredMyGroups.map((g) => (
            <GroupCard key={g.id} group={g} nextEvent={nextEventLabels.get(g.id)} />
          ))}
        </div>
      )}

      <h2 className="text-[length:var(--fs-lg)] font-bold mb-4" style={{ color: "var(--ink-0)" }}>{t("find.section")}</h2>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder={t("find.inviteCode")}
          className="flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)]"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            color: "var(--ink-1)",
          }}
          maxLength={9}
        />
        <Button
          onClick={handleJoinByCode}
          disabled={!inviteCode.trim() || joining} variant="secondary" className="disabled:opacity-50"
        >
          {joining ? t("button.joining") : t("button.joinCode")}
        </Button>
      </div>
      {error && <p className="text-[length:var(--fs-sm)] text-red-500 mb-4">{error}</p>}

      <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("find.publicGroups")}</h3>
      {publicLoading ? (
        <LoadingSkeleton kind="list" count={3} />
      ) : filteredPublicGroups.length === 0 ? (
        <EmptyState
          icon="👥"
          title={publicGroups.filter((g) => !myGroupIds.has(g.id)).length === 0 ? t("empty.noPublicGroups") : t("list.noGroupsFiltered")}
          description={publicGroups.filter((g) => !myGroupIds.has(g.id)).length > 0 ? t("list.noPublicGroupsFilteredDesc") : undefined}
          compact
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPublicGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              showJoinButton
              onJoin={() => handleJoinPublic(g.id)}
              joining={joiningPublic === g.id}
            />
          ))}
        </div>
      )}

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(groupId) => { setShowCreate(false); navigate(`/group/${groupId}`); }}
      />
    </div>
  );
}
