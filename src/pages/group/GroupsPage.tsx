import { appCheckFailureRecovery } from "../../services/appCheckFailureRecovery";
import NextEventContinuation from "../../components/group/NextEventContinuation";
import { isSportUiEnabled } from "../../config/sportFeatures";
import "./ClubSurface.css";
import { Users } from "lucide-react";
import GroupRequestHistory from "../../components/group/GroupRequestHistory";
import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useMyGroups, usePendingGroupRequestIds, usePublicGroups } from "../../hooks/useGroup";
import { logClientError } from "../../services/errorLogger";
import { usePublicClubDirectory } from "../../hooks/usePublicClubDirectory";
import { useGroupNextEvents } from "../../hooks/useGroupNextEvents";
import ClubLoginGate from "../../components/group/ClubLoginGate";
import GroupCard from "../../components/group/GroupCard";
import CreateGroupModal from "../../components/group/CreateGroupModal";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card, Chip, Text, DropdownSelect, Input } from "../../theme/components";
import {
  isPendingGroupJoinResult,
  type JoinGroupByCodeResult,
  type JoinGroupPublicResult,
} from "../../features/group/groupJoinResult";
import type { Group } from "@shared/types";
import { ICON_SIZE } from "../../theme/tokens/icon";

export default function GroupsPage() {
  const { t } = useTranslation("group");
  const { user } = useAuth();
  const uid = user?.uid;
  const joinIntent = useRef(0);
  useEffect(() => {
    setJoinRetryAt(0);
    setJoining(false);
    setJoiningPublic(null);
    setPendingNotice("");
    setError("");
    return () => { joinIntent.current += 1; };
  }, [uid]);
  const { showToast } = useToast();
  // 임베드(앱 클럽 탭)는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
  const { auth, ensureAppCheckReady, functions } = useFirebaseServices();
  const { groups: loadedMyGroups, loading: myLoading, error: myGroupsError, incomplete: myGroupsIncomplete, retry: retryMyGroups } = useMyGroups(user?.uid);
  // 이 화면에서 방금 가입한 클럽 — 서버 목록을 다시 읽기 전에도 곧바로 '내가 속한 클럽'으로 옮긴다(#1558).
  const [joinedHere, setJoinedHere] = useState<Group[]>([]);
  const [pendingHere, setPendingHere] = useState<Set<string>>(() => new Set());
  useEffect(() => { setJoinedHere([]); setPendingHere(new Set()); }, [uid]);
  // 서버가 가입을 확인하면 임시 항목을 넘겨준다. 이후 탈퇴로 서버 목록에서 빠져도 되살리지 않는다.
  useEffect(() => {
    if (!joinedHere.length || !loadedMyGroups.length) return;
    const confirmedIds = new Set(loadedMyGroups.map((group) => group.id));
    setJoinedHere((current) => {
      const pending = current.filter((group) => !confirmedIds.has(group.id));
      return pending.length === current.length ? current : pending;
    });
  }, [loadedMyGroups, joinedHere]);
  const pendingRequestIds = usePendingGroupRequestIds(user?.uid);
  useEffect(() => {
    if (!pendingHere.size) return;
    const confirmed = new Set([...pendingRequestIds, ...loadedMyGroups.map((group) => group.id)]);
    setPendingHere((current) => {
      const pending = new Set([...current].filter((id) => !confirmed.has(id)));
      return pending.size === current.size ? current : pending;
    });
  }, [loadedMyGroups, pendingRequestIds, pendingHere]);
  const myGroups = useMemo(() => {
    const loadedIds = new Set(loadedMyGroups.map((g) => g.id));
    return [...loadedMyGroups, ...joinedHere.filter((g) => !loadedIds.has(g.id))];
  }, [loadedMyGroups, joinedHere]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(() => searchParams.get("new") === "1");
  useEffect(() => { if (searchParams.get("new") === "1") { setShowCreate(true); const next = new URLSearchParams(searchParams); next.delete("new"); setSearchParams(next, { replace: true }); } }, [searchParams, setSearchParams]);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joiningPublic, setJoiningPublic] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState("");
  const [error, setError] = useState("");
  const [joinRetryAt, setJoinRetryAt] = useState(0);
  useEffect(() => {
    if (!joinRetryAt) return;
    // 대기 종료는 버튼만 복구한다. 가입·토큰 요청을 자동 재실행하지 않는다.
    const timer = setTimeout(() => setJoinRetryAt(0), Math.min(Math.max(0, joinRetryAt - Date.now()), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [joinRetryAt]);
  const [disciplineFilter, setDisciplineFilter] = useState<"ALL" | "bike" | "run" | "swim" | "tri">("ALL");
  const [myDisciplineFilter, setMyDisciplineFilter] = useState<"ALL" | "bike" | "run" | "swim" | "tri">("ALL");
  const [cityFilter, setCityFilter] = useState("");
  const queryParam = searchParams.get("q") ?? "";
  const sportParam = searchParams.get("sport") ?? "ALL";
  const cityParam = searchParams.get("city") ?? "";
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [mySearch, setMySearch] = useState(queryParam);
  useEffect(() => {
    setSearchQuery(queryParam);
    setMySearch(queryParam);
  }, [queryParam]);
  useEffect(() => {
    const sport = isSportUiEnabled(sportParam) && ["bike", "run", "swim", "tri"].includes(sportParam)
      ? sportParam as "bike" | "run" | "swim" | "tri" : "ALL";
    setDisciplineFilter(sport);
    setMyDisciplineFilter(sport);
  }, [sportParam]);
  useEffect(() => { setCityFilter(cityParam); }, [cityParam]);
  const findSearchRef = useRef<HTMLInputElement>(null);
  const { groups: signedPublicGroups, loading: signedPublicLoading, error: signedPublicGroupsError, retry: signedRetryPublicGroups, hasMore: signedPublicHasMore, loadingMore: signedPublicLoadingMore, loadMore: signedLoadMorePublicGroups } = usePublicGroups({
    enabled: !!user,
    searchText: searchQuery,
    discipline: disciplineFilter,
    city: cityFilter,
    maxCount: 20,
  });
  const anonymousDirectory = usePublicClubDirectory({ searchText: searchQuery, discipline: disciplineFilter, city: cityFilter }, !user);
  const publicGroups = user ? signedPublicGroups : anonymousDirectory.groups;
  const publicLoading = user ? signedPublicLoading : anonymousDirectory.loading;
  const publicGroupsError = user ? signedPublicGroupsError : anonymousDirectory.error;
  const retryPublicGroups = user ? signedRetryPublicGroups : anonymousDirectory.retry;
  const publicHasMore = user ? signedPublicHasMore : anonymousDirectory.hasMore;
  const publicLoadingMore = user ? signedPublicLoadingMore : anonymousDirectory.loadingMore;
  const loadMorePublicGroups = user ? signedLoadMorePublicGroups : anonymousDirectory.loadMore;
  const navigate = useNavigate();

  const myGroupIds = new Set((user ? myGroups : []).map((g) => g.id));
  // 로그인했는데 내 클럽을 아직 한 번도 읽지 못한 상태(처음 읽는 중). 다시 읽는 중에는 아는 목록으로 거른다.
  const myClubsUnknown = Boolean(user) && myLoading && loadedMyGroups.length === 0 && !myGroupsError;
  // 내 클럽 일부를 읽지 못했다 — 목록 밖 공개 클럽이 실제로는 가입 클럽일 수 있어 '미가입'으로 확정하지 않는다.
  // 다시 읽기 버튼은 두지 않는다. 새로고침(앱은 화면을 아래로 당기기)하면 다시 확인한다.
  const myClubsPartial = Boolean(user) && !myLoading && (myGroupsIncomplete || Boolean(myGroupsError));
  const myGroupIdList = useMemo(() => uid ? myGroups.map((g) => g.id) : [], [myGroups, uid]);
  const { byGroup: nextEventLabels, incompleteGroups = new Set<string>() } = useGroupNextEvents(myGroupIdList);

  // 클럽이 1개 이하면 종목 선택·검색을 숨기므로 필터도 적용하지 않는다 (K4).
  const showMyFilters = myGroups.length > 1;
  const filterGroups = <T extends { name: string; discipline?: string }>(list: T[]): T[] => {
    if (!showMyFilters) return list;
    const q = mySearch.trim().toLowerCase();
    return list.filter((g) => {
      if (myDisciplineFilter !== "ALL" && (g.discipline ?? "bike") !== myDisciplineFilter) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const filteredMyGroups = useMemo(() => filterGroups(myGroups), [myGroups, myDisciplineFilter, mySearch, showMyFilters]);
  const hasPublicFilters = Boolean(searchQuery.trim() || cityFilter.trim() || disciplineFilter !== "ALL");
  // 로그인 회원의 기존 가입 클럽 제외 계약을 유지한다.
  const filteredPublicGroups = useMemo(
    () => user ? publicGroups.filter((group) => !myGroupIds.has(group.id)) : publicGroups,
    [publicGroups, myGroupIds, user]
  );

  const handleJoinByCode = async () => {
    if (!uid || !inviteCode.trim() || joining || joinRetryAt > Date.now()) return;
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
      const attestation = appCheckFailureRecovery(err);
      if (attestation) {
        if (attestation.waitMs) setJoinRetryAt(Date.now() + attestation.waitMs);
        setError(attestation.waitMs
          ? t("error.joinVerificationWait", { count: Math.ceil(attestation.waitMs / 60_000) })
          : t("error.joinVerificationFailed"));
        return;
      }
      setError((!["functions/permission-denied", "functions/unauthenticated"].includes(err?.code) && (err?.code === "functions/not-found" || err?.message === "Invalid invite code" || err?.message === "Invalid or expired invite code" || (err?.code === "functions/invalid-argument" && err?.message === "유효한 초대 코드가 필요합니다."))) ? t("error.invalidInviteCode") : t("error.joinFailed"));
    } finally {
      if (isCurrent()) setJoining(false);
    }
  };

  const handleJoinPublic = async (group: Group) => {
    if (!uid || joiningPublic || auth.currentUser?.uid !== uid) return;
    const intent = joinIntent.current;
    const isCurrent = () => intent === joinIntent.current && auth.currentUser?.uid === uid;
    const joined = (toastKey: "join.joinedToast" | "join.alreadyMemberToast") => {
      // 가입 완료 — 알림을 띄우고 '내가 속한 클럽'으로 옮긴 뒤 서버 목록을 다시 읽는다(상세로 이동하지 않는다).
      setJoinedHere((prev) => prev.some((g) => g.id === group.id) ? prev : [...prev, group]);
      showToast(t(toastKey, { name: group.name }), "success");
      retryMyGroups();
    };
    const pending = () => {
      setPendingHere((prev) => new Set(prev).add(group.id));
      setPendingNotice(t("join.pendingPublic", { name: group.name }));
      showToast(t("join.pendingToast"));
    };
    setJoiningPublic(group.id);
    setPendingNotice("");
    setError("");
    try {
      // 초대 코드 가입·클럽 상세 가입과 같은 경로 — App Check 를 준비한 뒤 부른다.
      await ensureAppCheckReady();
      if (!isCurrent()) return;
      const joinFn = httpsCallable<{ groupId: string }, JoinGroupPublicResult>(functions, "joinGroupPublic");
      const result = await joinFn({ groupId: group.id });
      if (!isCurrent()) return;
      if (result.data.success !== true) throw new Error("Public group join failed");
      if (result.data.status === "pending") { pending(); return; }
      joined("join.joinedToast");
    } catch (err: any) {
      if (!isCurrent()) return;
      // 서버가 이미 회원·이미 신청이라고 답하면 실패가 아니다 — 목록이 늦게 갱신돼 버튼이 남아 있던 경우다.
      if (err?.code === "functions/already-exists") {
        if (err?.message === "Join request already pending") pending();
        else joined("join.alreadyMemberToast");
        return;
      }
      logClientError("GroupsPage.joinPublic", err, { groupId: group.id });
      const attestation = appCheckFailureRecovery(err);
      if (attestation) {
        if (attestation.waitMs) setJoinRetryAt(Date.now() + attestation.waitMs);
        showToast(attestation.waitMs
          ? t("error.joinVerificationWait", { count: Math.ceil(attestation.waitMs / 60_000) })
          : t("error.joinVerificationFailed"), "error");
        return;
      }
      // 실패는 누른 카드 근처에서 보이도록 알림으로 띄운다(초대 코드 칸 아래 문구는 화면 밖이라 보이지 않았다).
      showToast(t("error.joinFailed"), "error");
    } finally {
      if (isCurrent()) setJoiningPublic(null);
    }
  };

  const myClubSection = <section data-testid="C0-1" className="club-my-section">
      {myGroups.length > 0 && <>
        <Text as="h2" variant="title">{t("myGroups")}</Text>
        {showMyFilters && <div data-testid="C0-1-1" className="club-my-filters">
          <label>{t("list.mySportLabel")}<DropdownSelect label={t("list.mySportLabel")} value={myDisciplineFilter} onChange={value => setMyDisciplineFilter(value as typeof myDisciplineFilter)} options={["ALL", "bike", "run", "swim", "tri"].filter(isSportUiEnabled).map(sport => ({ value: sport, label: t(sport === "ALL" ? "filter.all" : `filter.${sport}`) }))} /></label>
          <label>{t("list.mySearchLabel")}<Input type="search" value={mySearch} onChange={event => setMySearch(event.target.value)} aria-label={t("list.mySearchLabel")} placeholder={t("search.groupName")} className="ds-input" /></label>
        </div>}
      </>}

      {Boolean(myGroupsError) && myGroups.length > 0 && <div><ErrorState title={t("error.loadFailed")} onRetry={retryMyGroups} compact /></div>}
      {Boolean(myGroupsError) && myGroups.length === 0 ? (
        <div>
          <ErrorState title={t("error.loadFailed")} onRetry={retryMyGroups} compact />
        </div>
      ) : myLoading && myGroups.length === 0 ? (
        // 다시 읽는 동안에도 이미 아는 클럽(방금 가입한 클럽 포함)은 계속 보인다 — 자리표시는 처음 읽을 때만(#1558).
        <div>
          <LoadingSkeleton kind="list" count={3} />
        </div>
      ) : myGroups.length === 0 ? null : filteredMyGroups.length === 0 ? (
        <div>
          <EmptyState
            icon={<Users size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
            title={t("list.noGroupsFiltered")}
            description={t("list.noGroupsFilteredDesc")}
            compact
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMyGroups.map((g) => (
            <div key={g.id}><GroupCard group={g} showMyRole nextEvent={nextEventLabels.get(g.id)} />{incompleteGroups.has(g.id) && <NextEventContinuation groupId={g.id} />}</div>
          ))}
        </div>
      )}

      <GroupRequestHistory userId={user?.uid} />
    </section>;

  return (
    <div className="club-surface">
      <header data-testid="C0-0" className="club-page-header">
        <div><Text as="h1" variant="pageTitle">{t("clubsTitle")}</Text>
        {user && myGroups.length > 0 && <Text as="p" variant="bodySmall" tone="tertiary" data-testid="C0-0-1">{t("list.groupCount", { count: myGroups.length })}</Text>}</div>
        <div className="club-page-actions">
          {user && myGroups.length > 0 && <Button data-testid="C0-0-2" variant="secondary" onClick={() => { document.getElementById("club-find")?.scrollIntoView({ block: "start" }); findSearchRef.current?.focus({ preventScroll: true }); }}>{t("list.findClubs")}</Button>}
          {user && <Button data-testid="C0-0-3" onClick={() => setShowCreate(true)} variant="primary">{t("button.create")}</Button>}
        </div>
      </header>
      {user && (myGroups.length > 0 || myLoading || Boolean(myGroupsError)) && myClubSection}

      <Text as="h2" variant="title" data-testid="C0-2" id="club-find" className="mb-4">{t("find.section")}</Text>
      {user && !myLoading && !myGroupsError && myGroups.length === 0 && <Text as="p" variant="body" tone="secondary" data-testid="C0.noClub" className="mb-4">{t("list.noGroupsDesc")}</Text>}
      {!user && <Text as="p" tone="secondary" className="mb-4">{t("public.directoryHint")}</Text>}
      {/* 검색 + 종목 필터 */}
      <div data-testid="C0-2-1" className="flex items-center flex-wrap mb-4" style={{ gap: 'var(--space-2)' }}>
        <Input
          type="search"
          ref={findSearchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.groupName")}
          aria-label={t("search.groupName")}
          className="club-find-query"
        />
        <Input
          type="search"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder={t("search.city")}
          aria-label={t("search.city")}
          className="club-find-city"
        />
        <div role="group" aria-label={t("filter.all")} className="flex items-center flex-wrap" style={{ gap: 'var(--space-1)' }}>
          {[
            { v: "ALL" as const, label: t("filter.all") },
            { v: "bike" as const, label: t("filter.bike") },
            { v: "run" as const, label: t("filter.run") },
            { v: "swim" as const, label: t("filter.swim") },
            { v: "tri" as const, label: t("filter.tri") },
          ].filter(o => isSportUiEnabled(o.v)).map((o) => {
            const active = disciplineFilter === o.v;
            return (
              <Chip key={o.v} selectable selected={active} onClick={() => setDisciplineFilter(o.v)}>
                {o.label}
              </Chip>
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


      {myClubsPartial && filteredPublicGroups.length > 0 && <Text as="p" variant="bodySmall" tone="secondary" role="status" data-testid="C0-2-5" className="mb-4">{t("list.membershipUnconfirmed")}</Text>}
      {Boolean(publicGroupsError) && filteredPublicGroups.length > 0 && <div className="mb-4"><ErrorState title={t("error.loadFailed")} onRetry={retryPublicGroups} compact /></div>}
      {Boolean(publicGroupsError) && filteredPublicGroups.length === 0 ? (
        <ErrorState title={t("error.loadFailed")} onRetry={retryPublicGroups} compact />
      ) : publicLoading || myClubsUnknown ? (
        // 내 클럽을 아직 한 번도 읽지 못했으면 클럽 찾기를 보이지 않는다 — 가입한 클럽이 '가입 신청'과 함께 섞여 보였다(#1558).
        <LoadingSkeleton kind="list" count={3} />
      ) : filteredPublicGroups.length === 0 ? (
        <div data-testid="C0-2-4"><EmptyState
          icon={<Users size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
          title={hasPublicFilters ? t("list.noGroupsFiltered") : t("empty.noPublicGroups")}
          description={hasPublicFilters ? t("list.noPublicGroupsFilteredDesc") : undefined}
          compact
        /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPublicGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              showMyRole={myGroupIds.has(g.id)}
              showJoinButton={!myGroupIds.has(g.id)}
              onJoin={!user || myGroupIds.has(g.id) ? undefined : () => handleJoinPublic(g as Group)}
              joining={joiningPublic === g.id}
              joinPending={pendingHere.has(g.id) || pendingRequestIds.has(g.id)}
              /* 내 클럽을 다시 읽는 동안에는 이미 가입한 클럽일 수 있어 가입 버튼을 잠근다(#1558). */
              joinChecking={Boolean(user) && myLoading}
              /* 내 클럽 일부를 읽지 못했으면 가입 여부를 모른다 — 가입 버튼을 잠근다. */
              joinUnconfirmed={myClubsPartial}
            />
          ))}
        </div>
      )}

      {publicHasMore && !publicLoading && <Button variant="secondary" disabled={publicLoadingMore} onClick={loadMorePublicGroups}>{t("common:button.more")}</Button>}

      {!user && <ClubLoginGate />}
      {user && <Card data-testid="C0-3" className="club-invite-card" padding="card">
        <Text as="h2" variant="title">{t("find.inviteTitle")}</Text>
        <Text as="p" variant="body" tone="secondary">{t("find.inviteHint")}</Text>
        <label htmlFor="club-invite-code" className="club-invite-label">{t("find.inviteLabel")}</label>
        <div className="club-invite-form">
        <Input id="club-invite-code" data-testid="C0-3-1"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder={t("find.inviteCode")}
          className="flex-1"
          maxLength={9}
        />
        <Button
          onClick={handleJoinByCode}
          disabled={!inviteCode.trim() || joining || joinRetryAt > 0} variant="secondary" className="disabled:opacity-50"
        >
          {joining ? t("button.joining") : t("button.joinCode")}
        </Button>
        </div>
      </Card>}
      {error && <p role="alert" className="text-[length:var(--ft-body-size)] text-red-500 mb-4">{error}</p>}


      {user && !myLoading && !myGroupsError && myGroups.length === 0 && <GroupRequestHistory userId={user?.uid} sectionId="C0-1" />}
      <Card padding="card" className="club-league-card"><Text as="h2" variant="subtitle">{t("challenges.title")}</Text><Text as="p" variant="body" tone="secondary">{t("challenges.desc")}</Text><Link data-testid="C0-4" to="/explore/challenges">{t("list.viewLeague")}</Link></Card>

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(groupId) => { setShowCreate(false); navigate(`/club/${groupId}`); }}
      />
    </div>
  );
}
