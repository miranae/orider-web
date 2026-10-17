import "./ClubSurface.css";
import { Users } from "lucide-react";
import GroupRequestHistory from "../../components/group/GroupRequestHistory";
import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useMyGroups, usePublicGroups } from "../../hooks/useGroup";
import { useGroupNextEvents } from "../../hooks/useGroupNextEvents";
import GroupCard from "../../components/group/GroupCard";
import CreateGroupModal from "../../components/group/CreateGroupModal";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton, PermissionGate } from "../../components/redesign";
import { Button, Card, Text, DropdownSelect, Input } from "../../theme/components";
import {
  isPendingGroupJoinResult,
  type JoinGroupByCodeResult,
  type JoinGroupPublicResult,
} from "../../features/group/groupJoinResult";
import type { Group } from "@shared/types";

export default function GroupsPage() {
  const { t } = useTranslation("group");
  const { user } = useAuth();
  const uid = user?.uid;
  const joinIntent = useRef(0);
  useEffect(() => {
    setJoining(false);
    setJoiningPublic(null);
    setPendingNotice("");
    setError("");
    return () => { joinIntent.current += 1; };
  }, [uid]);
  const { showToast } = useToast();
  const { groups: myGroups, loading: myLoading, error: myGroupsError, retry: retryMyGroups } = useMyGroups(user?.uid);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(() => searchParams.get("new") === "1");
  useEffect(() => { if (searchParams.get("new") === "1") { setShowCreate(true); const next = new URLSearchParams(searchParams); next.delete("new"); setSearchParams(next, { replace: true }); } }, [searchParams, setSearchParams]);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joiningPublic, setJoiningPublic] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState("");
  const [error, setError] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState<"ALL" | "bike" | "run" | "swim" | "tri">("ALL");
  const [myDisciplineFilter, setMyDisciplineFilter] = useState<"ALL" | "bike" | "run" | "swim" | "tri">("ALL");
  const [cityFilter, setCityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mySearch, setMySearch] = useState("");
  const findSearchRef = useRef<HTMLInputElement>(null);
  const { groups: publicGroups, loading: publicLoading, error: publicGroupsError, retry: retryPublicGroups } = usePublicGroups({
    enabled: !!user,
    searchText: searchQuery,
    discipline: disciplineFilter,
    city: cityFilter,
    maxCount: 30,
  });
  const navigate = useNavigate();

  const myGroupIds = new Set(myGroups.map((g) => g.id));
  const myGroupIdList = useMemo(() => myGroups.map((g) => g.id), [myGroups]);
  const { byGroup: nextEventLabels } = useGroupNextEvents(myGroupIdList);

  const filterGroups = <T extends { name: string; discipline?: string }>(list: T[]): T[] => {
    const q = mySearch.trim().toLowerCase();
    return list.filter((g) => {
      if (myDisciplineFilter !== "ALL" && (g.discipline ?? "bike") !== myDisciplineFilter) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const filteredMyGroups = useMemo(() => filterGroups(myGroups), [myGroups, myDisciplineFilter, mySearch]);
  const filteredPublicGroups = useMemo(
    () => publicGroups.filter((g) => !myGroupIds.has(g.id)),
    [publicGroups, myGroupIds]
  );

  const handleJoinByCode = async () => {
    if (!uid || !inviteCode.trim() || joining) return;
    const intent = joinIntent.current;
    const isCurrent = () => intent === joinIntent.current && auth.currentUser?.uid === uid;
    setJoining(true);
    setError("");
    setPendingNotice("");
    try {
      await ensureAppCheckReady();
      if (!isCurrent()) return;
      const joinFn = httpsCallable<{ inviteCode: string }, JoinGroupByCodeResult>(functions, "joinGroupByCode");
      const result = await joinFn({ inviteCode: inviteCode.trim() });
      if (!isCurrent()) return;
      if (isPendingGroupJoinResult(result.data)) {
        setPendingNotice(t("join.pendingByCode"));
        showToast(t("join.pendingToast"));
        return;
      }
      navigate(`/club/${result.data.groupId}`);
    } catch (err: any) {
      if (!isCurrent()) return;
      setError((!["functions/permission-denied", "functions/unauthenticated"].includes(err?.code) && (err?.code === "functions/not-found" || err?.message === "Invalid invite code" || err?.message === "Invalid or expired invite code" || (err?.code === "functions/invalid-argument" && err?.message === "유효한 초대 코드가 필요합니다."))) ? t("error.invalidInviteCode") : t("error.joinFailed"));
    } finally {
      if (isCurrent()) setJoining(false);
    }
  };

  const handleJoinPublic = async (group: Group) => {
    if (!uid || joiningPublic || auth.currentUser?.uid !== uid) return;
    const intent = joinIntent.current;
    const isCurrent = () => intent === joinIntent.current && auth.currentUser?.uid === uid;
    setJoiningPublic(group.id);
    setPendingNotice("");
    setError("");
    try {
      const joinFn = httpsCallable<{ groupId: string }, JoinGroupPublicResult>(functions, "joinGroupPublic");
      const result = await joinFn({ groupId: group.id });
      if (!isCurrent()) return;
      if (result.data.success !== true) throw new Error("Public group join failed");
      if (result.data.status === "pending") {
        setPendingNotice(t("join.pendingPublic", { name: group.name }));
        showToast(t("join.pendingToast"));
        return;
      }
      navigate(`/club/${group.id}`);
    } catch {
      if (!isCurrent()) return;
      setError(t("error.joinFailed"));
    } finally {
      if (isCurrent()) setJoiningPublic(null);
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("error.loginRequired")} />
      </div>
    );
  }

  const myClubSection = <section data-testid="C0-1">
      {myGroups.length > 0 && <>
        <Text as="h2" variant="title" className="mb-4">{t("myGroups")}</Text>
        <div data-testid="C0-1-1" className="club-my-filters mb-4">
          <label>{t("list.mySportLabel")}<DropdownSelect label={t("list.mySportLabel")} value={myDisciplineFilter} onChange={value => setMyDisciplineFilter(value as typeof myDisciplineFilter)} options={["ALL", "bike", "run", "swim", "tri"].map(sport => ({ value: sport, label: t(sport === "ALL" ? "filter.all" : `filter.${sport}`) }))} /></label>
          <label>{t("list.mySearchLabel")}<Input type="search" value={mySearch} onChange={event => setMySearch(event.target.value)} aria-label={t("list.mySearchLabel")} placeholder={t("search.groupName")} className="ds-input" /></label>
        </div>
      </>}

      {Boolean(myGroupsError) && myGroups.length > 0 && <div className="mb-4"><ErrorState title={t("error.loadFailed")} onRetry={retryMyGroups} compact /></div>}
      {Boolean(myGroupsError) && myGroups.length === 0 ? (
        <div className="mb-8">
          <ErrorState title={t("error.loadFailed")} onRetry={retryMyGroups} compact />
        </div>
      ) : myLoading ? (
        <div className="mb-8">
          <LoadingSkeleton kind="list" count={3} />
        </div>
      ) : myGroups.length === 0 ? null : filteredMyGroups.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon={<Users size={24} style={{ marginInline: "auto" }} />}
            title={t("list.noGroupsFiltered")}
            description={t("list.noGroupsFilteredDesc")}
            compact
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filteredMyGroups.map((g) => (
            <GroupCard key={g.id} group={g} showMyRole nextEvent={nextEventLabels.get(g.id)} />
          ))}
        </div>
      )}

      <GroupRequestHistory userId={user.uid} />
    </section>;

  return (
    <div className="club-surface">
      <header data-testid="C0-0" className="club-page-header">
        <div><Text as="h1" variant="pageTitle">{t("clubsTitle")}</Text>
        {myGroups.length > 0 && <Text as="p" variant="body" tone="secondary" data-testid="C0-0-1">{t("list.groupCount", { count: myGroups.length })}</Text>}</div>
        <div className="club-page-actions">
          {myGroups.length > 0 && <Button data-testid="C0-0-2" variant="secondary" size="sm" onClick={() => { document.getElementById("club-find")?.scrollIntoView({ block: "start" }); findSearchRef.current?.focus({ preventScroll: true }); }}>{t("list.findClubs")}</Button>}
          <Button data-testid="C0-0-3" onClick={() => setShowCreate(true)} variant="primary" size="sm">{t("button.create")}</Button>
        </div>
      </header>
      {(myGroups.length > 0 || myLoading || Boolean(myGroupsError)) && myClubSection}

      <Text as="h2" variant="title" data-testid="C0-2" id="club-find" className="mb-4">{t("find.section")}</Text>
      {!myLoading && !myGroupsError && myGroups.length === 0 && <Text as="p" variant="body" tone="secondary" data-testid="C0.noClub" className="mb-4">{t("list.noGroupsDesc")}</Text>}
      {/* 검색 + 종목 필터 */}
      <div data-testid="C0-2-1" className="flex items-center flex-wrap mb-4" style={{ gap: 'var(--space-2)' }}>
        <Input
          type="search"
          ref={findSearchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.groupName")}
          aria-label={t("search.groupName")}
          className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-size)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
          style={{ flex: "1 1 200px", background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
        />
        <Input
          type="search"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder={t("search.city")}
          aria-label={t("search.city")}
          className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-size)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
          style={{ flex: "0 1 180px", background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
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



      {pendingNotice && (
        <Card padding="compact" className="mb-4" role="status" style={{ borderColor: "color-mix(in oklch, var(--amber) 45%, var(--line-soft))" }}>
          <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: "var(--space-1)" }}>
            {t("join.pendingTitle")}
          </div>
          <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)" }}>
            {pendingNotice}
          </div>
        </Card>
      )}


      {Boolean(publicGroupsError) && filteredPublicGroups.length > 0 && <div className="mb-4"><ErrorState title={t("error.loadFailed")} onRetry={retryPublicGroups} compact /></div>}
      {Boolean(publicGroupsError) && filteredPublicGroups.length === 0 ? (
        <ErrorState title={t("error.loadFailed")} onRetry={retryPublicGroups} compact />
      ) : publicLoading ? (
        <LoadingSkeleton kind="list" count={3} />
      ) : filteredPublicGroups.length === 0 ? (
        <div data-testid="C0-2-4"><EmptyState
          icon={<Users size={24} style={{ marginInline: "auto" }} />}
          title={publicGroups.filter((g) => !myGroupIds.has(g.id)).length === 0 ? t("empty.noPublicGroups") : t("list.noGroupsFiltered")}
          description={publicGroups.filter((g) => !myGroupIds.has(g.id)).length > 0 ? t("list.noPublicGroupsFilteredDesc") : undefined}
          compact
        /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPublicGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              showJoinButton
              onJoin={() => handleJoinPublic(g)}
              joining={joiningPublic === g.id}
            />
          ))}
        </div>
      )}

      <Card data-testid="C0-3" className="club-invite-card" padding="card">
        <Text as="h2" variant="title">{t("find.inviteTitle")}</Text>
        <Text as="p" variant="body" tone="secondary">{t("find.inviteHint")}</Text>
        <label htmlFor="club-invite-code">{t("find.inviteLabel")}</label>
        <div className="club-invite-form">
        <Input id="club-invite-code" data-testid="C0-3-1"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder={t("find.inviteCode")}
          className="flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-size)]"
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
      </Card>
      {error && <p className="text-[length:var(--ft-body-size)] text-red-500 mb-4">{error}</p>}


      {!myLoading && !myGroupsError && myGroups.length === 0 && <GroupRequestHistory userId={user.uid} sectionId="C0-1" />}
      <Card padding="card" className="club-league-card"><Text as="h2" variant="subtitle">{t("challenges.title")}</Text><Text as="p" variant="body" tone="secondary">{t("challenges.desc")}</Text><Link data-testid="C0-4" to="/explore/challenges">{t("list.viewLeague")}</Link></Card>

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(groupId) => { setShowCreate(false); navigate(`/club/${groupId}`); }}
      />
    </div>
  );
}
