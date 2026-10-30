import "./ExploreReview.css";
import "./ExploreAthletesPage.css";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useDialog } from "../contexts/DialogContext";
import { useLocale } from "../contexts/LocaleContext";
import { useFriends, sendFriendRequest } from "../hooks/useFriends";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { getSportLabelKey } from "../utils/sportType";
import Avatar from "../components/Avatar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/redesign";
import CoachSignInButton from "./coach/CoachSignInButton";
import { Button, Card, Input, Text } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import { formatDistance } from "../utils/units";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../config/activitySubscriptions";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import {
  searchUsers, userSearchErrorKind, USER_SEARCH_MAX_LENGTH,
  type SearchUserItem, type UserSearchErrorKind,
} from "../services/userSearch";

type FriendState = "friend" | "sent" | "received" | "none";
type PendingAction = "send" | "accept" | "cancel";

interface SearchState {
  query: string;
  status: "loading" | "done" | "error";
  items: SearchUserItem[];
  nextCursor: string | null;
  error: UserSearchErrorKind | null;
  loadingMore: boolean;
}

/** 탐색 > 사람 (E5): 이메일·닉네임·친구 코드로 사용자를 찾는다. 검색어 없이 목록을 조회하지 않는다. */
export default function ExploreAthletesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { t } = useTranslation("friends");
  const { t: commonT, i18n } = useTranslation("common");
  const { units } = useLocale();
  const { showToast } = useToast();
  const dialog = useDialog();
  const { friends, requests, sentRequests = [], acceptRequest, cancelRequest } = useFriends();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = (searchParams.get("q") ?? "").trim().slice(0, USER_SEARCH_MAX_LENGTH);
  const [draft, setDraft] = useState(urlQuery);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<string, PendingAction>>(() => new Map());
  // 낙관적 상태는 걸 당시의 구독 상태(base)와 함께 둔다 — 구독이 바뀌면(확인·상대 행동) 구독 쪽을 따른다
  const [localStatus, setLocalStatus] = useState<ReadonlyMap<string, { state: FriendState; base: FriendState }>>(() => new Map());
  const epoch = useRef(0);
  const signedIn = !!user && !user.isAnonymous;

  const runSearch = useCallback(async (query: string) => {
    const request = ++epoch.current;
    setSearch({ query, status: "loading", items: [], nextCursor: null, error: null, loadingMore: false });
    try {
      const result = await searchUsers(query);
      if (request !== epoch.current) return;
      setSearch({ query, status: "done", items: result.items, nextCursor: result.nextCursor, error: null, loadingMore: false });
    } catch (error) {
      if (request !== epoch.current) return;
      setSearch({ query, status: "error", items: [], nextCursor: null, error: userSearchErrorKind(error), loadingMore: false });
    }
  }, []);

  // URL(?q=)이 검색의 정본 — 새로고침·뒤로 가기에서도 같은 결과를 다시 그린다.
  useEffect(() => {
    setDraft(urlQuery);
    if (!signedIn || !urlQuery) {
      epoch.current += 1;
      setSearch(null);
      return;
    }
    void runSearch(urlQuery);
  }, [urlQuery, signedIn, runSearch]);

  const loadMore = async () => {
    if (!search || search.status !== "done" || !search.nextCursor || search.loadingMore) return;
    const request = epoch.current;
    const { query, nextCursor } = search;
    setSearch(previous => previous && { ...previous, loadingMore: true });
    try {
      const result = await searchUsers(query, nextCursor);
      if (request !== epoch.current) return;
      setSearch(previous => previous && {
        ...previous,
        items: [...previous.items, ...result.items.filter(item => !previous.items.some(existing => existing.id === item.id))],
        nextCursor: result.nextCursor,
        loadingMore: false,
      });
    } catch (error) {
      if (request !== epoch.current) return;
      setSearch(previous => previous && { ...previous, loadingMore: false });
      showToast(t(`search.error.${userSearchErrorKind(error)}`), "error");
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = draft.trim();
    if (!query) return;
    if (query === urlQuery) { void runSearch(query); return; }
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("q", query);
      return next;
    });
  };

  const friendIds = useMemo(() => new Set(friends.map(friend => friend.userId)), [friends]);
  const receivedIds = useMemo(() => new Set(requests.map(request => request.requesterId)), [requests]);
  const sentIds = useMemo(() => new Set(sentRequests.map(request => request.targetId)), [sentRequests]);
  const subscribedState = (id: string): FriendState => {
    if (friendIds.has(id)) return "friend";
    if (receivedIds.has(id)) return "received";
    return sentIds.has(id) ? "sent" : "none";
  };
  const friendState = (id: string): FriendState => {
    const subscribed = subscribedState(id);
    const local = localStatus.get(id);
    return local && local.base === subscribed ? local.state : subscribed;
  };

  const withPending = async (id: string, action: PendingAction, work: () => Promise<void>) => {
    if (pending.has(id)) return;
    setPending(previous => new Map(previous).set(id, action));
    try { await work(); }
    finally { setPending(previous => { const next = new Map(previous); next.delete(id); return next; }); }
  };
  const setLocal = (id: string, state: FriendState | null) => setLocalStatus(previous => {
    const next = new Map(previous);
    if (state) next.set(id, { state, base: subscribedState(id) }); else next.delete(id);
    return next;
  });

  const handleSend = (item: SearchUserItem) => withPending(item.id, "send", async () => {
    if (!user) return;
    setLocal(item.id, "sent");
    try {
      await sendFriendRequest({
        uid: user.uid,
        nickname: profile?.nickname || user.displayName || "",
        profileImage: profile?.photoURL || user.photoURL || null,
      }, item.id);
      track("friend_request_send", { via: "explore_search", matched_by: item.matchedBy });
      showToast(t("search.toast.sent", { nickname: item.nickname || t("defaultNickname") }));
    } catch (error) {
      setLocal(item.id, null);
      logClientError("ExploreAthletesPage.sendFriendRequest", error, { targetUserId: item.id });
      showToast(t("search.toast.sendFailed"), "error");
    }
  });
  const handleAccept = (item: SearchUserItem) => withPending(item.id, "accept", async () => {
    try {
      await acceptRequest(item.id);
      setLocal(item.id, "friend");
      showToast(t("toast.acceptSuccess"));
    } catch (error) {
      logClientError("ExploreAthletesPage.acceptRequest", error, { requesterId: item.id });
      showToast(t("toast.acceptFailed"), "error");
    }
  });
  const handleCancel = (item: SearchUserItem) => withPending(item.id, "cancel", async () => {
    if (!await dialog.confirm(t("cancelConfirm"))) return;
    try {
      await cancelRequest(item.id);
      setLocal(item.id, "none");
      showToast(t("cancelSuccess"));
    } catch {
      // cancelFriendRequest 가 실패를 기록한다.
      showToast(t("cancelFailed"), "error");
    }
  });

  const heading = <Text data-testid="E5-0" as="h1" variant="pageTitle">{commonT("nav.people")}</Text>;
  if (authLoading) return <div className="explore-challenges-surface space-y-6">{heading}</div>;
  if (!signedIn) {
    return <div className="explore-challenges-surface space-y-6">
      {heading}
      <div data-testid="E5.guest" className="explore-people-guest">
        <Text as="p" tone="secondary">{t("search.loginRequired")}</Text>
        <CoachSignInButton label={t("search.loginAction")} />
      </div>
    </div>;
  }

  const renderAction = (item: SearchUserItem) => {
    const state = friendState(item.id);
    const action = pending.get(item.id);
    const name = item.nickname || t("defaultNickname");
    if (state === "friend") {
      return <Button data-testid="E5-2-2" variant="secondary" size="sm" disabled>{t("search.action.friend")}</Button>;
    }
    if (state === "received") {
      return <Button data-testid="E5-2-2" size="sm" loading={action === "accept"} aria-label={t("acceptNamed", { name })}
        onClick={() => void handleAccept(item)}>{t("accept")}</Button>;
    }
    if (state === "sent") {
      return <span className="explore-people-sent">
        <Text variant="caption" tone="secondary">{t("search.action.sent")}</Text>
        <Button data-testid="E5-2-3" variant="ghost" size="sm" disabled={!!action} loading={action === "cancel"}
          aria-label={t("search.action.cancelNamed", { name })} onClick={() => void handleCancel(item)}>{t("cancelRequest")}</Button>
      </span>;
    }
    if (!item.friendRequestsAllowed) return null;
    return <Button data-testid="E5-2-2" size="sm" disabled={!!action} aria-label={t("search.action.requestNamed", { name })}
      onClick={() => void handleSend(item)}>{t("search.action.request")}</Button>;
  };

  const countValue = (value: number | undefined) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";
  // 누적 거리는 정수 + 천 단위 구분(8,412km) — 목록 한 줄 요약용
  const formatTotalDistance = (meters: number) => {
    const text = formatDistance(meters, units, 0);
    const match = /^(\d+)(\D+)$/.exec(text);
    return match ? `${Number(match[1]).toLocaleString(locale)}${match[2]}` : text;
  };
  const renderBio = (item: SearchUserItem) => {
    const bio = item.profilePublic ? item.details?.bio?.trim() : undefined;
    return bio ? <Text data-testid="E5-2-7" as="span" variant="caption" tone="secondary" className="explore-people-bio">{bio}</Text> : null;
  };
  const renderSummary = (item: SearchUserItem) => {
    const details = item.profilePublic ? item.details : undefined;
    const meta: string[] = [];
    if (details?.primaryDiscipline) meta.push(commonT(`discipline.${details.primaryDiscipline}`));
    if (typeof details?.totalDistance === "number" && Number.isFinite(details.totalDistance) && details.totalDistance > 0) meta.push(formatTotalDistance(details.totalDistance));
    // 내 프로필 요약(ProfileSocialStats)과 같은 순서·명칭. 구독 수치는 구독 기능이 켜졌을 때만.
    const stats = details ? ([
      ...(ACTIVITY_SUBSCRIPTIONS_ENABLED ? [
        ["subscriptions", commonT("activitySubscriptions.subscriptions"), countValue(details.subscriptionCount)],
        ["subscribers", commonT("activitySubscriptions.subscribers"), countValue(details.subscriberCount)],
      ] : []),
      ["friends", commonT("activitySubscriptions.friends"), countValue(details.friendCount)],
      ["activities", commonT("profileSocial.activities"), countValue(details.activityCount)],
    ] as [string, string, number | undefined][]).filter((stat): stat is [string, string, number] => stat[2] !== undefined) : [];
    return <>
      <span className="explore-people-meta">
        {item.friendCode && <span data-testid="E5-2-5" className="explore-people-code">{item.friendCode}</span>}
        {meta.length > 0 && <span data-testid="E5-2-8">{meta.join(" · ")}</span>}
      </span>
      {stats.length > 0 && <span data-testid="E5-2-9" className="explore-people-stats">
        {stats.map(([key, label, value]) => <span key={key} aria-label={`${label} ${value.toLocaleString(locale)}`}>
          {label} <strong>{value.toLocaleString(locale)}</strong>
        </span>)}
      </span>}
    </>;
  };
  const renderLatest = (item: SearchUserItem) => {
    const lastActivity = item.profilePublic ? item.details?.lastActivity : null;
    if (!lastActivity || !Number.isFinite(lastActivity.startTime)) return null;
    return <span data-testid="E5-2-10" className="explore-people-latest">
      <span className="explore-people-latest-label">{commonT("profileSocial.latest")}</span>
      <Link to={`/activity/${lastActivity.id}`} className="explore-people-latest-link">{lastActivity.title?.trim() || commonT(getSportLabelKey(lastActivity.type))}</Link>
      <span className="explore-people-latest-date">· {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(lastActivity.startTime)}</span>
    </span>;
  };

  return <div className="explore-challenges-surface space-y-6">
    {heading}
    <div className="explore-people-search">
    <form data-testid="E5-1" role="search" aria-label={t("search.label")} className="explore-people-form" onSubmit={onSubmit}>
      <Input data-testid="E5-1-1" type="search" value={draft} maxLength={USER_SEARCH_MAX_LENGTH}
        aria-label={t("search.label")} aria-describedby="explore-people-hint" placeholder={t("search.placeholder")}
        onChange={event => setDraft(event.target.value)} className="explore-people-input" />
      <Button data-testid="E5-1-2" type="submit" disabled={!draft.trim()}>
        <Search size={ICON_SIZE.sm} aria-hidden="true" />{t("search.submit")}
      </Button>
    </form>
    <Text data-testid="E5-1-3" id="explore-people-hint" as="p" variant="caption" tone="secondary">{t("search.hint")}</Text>
    </div>

    {search && <section data-testid="E5-2" aria-label={t("search.resultsLabel")} aria-live="polite" aria-busy={search.status === "loading"}>
      {search.status === "loading" ? <div data-testid="E5.loading"><LoadingSkeleton kind="list" count={3} /></div>
        : search.status === "error" ? <div data-testid="E5.error">
          <ErrorState compact title={commonT("error.title")} description={t(`search.error.${search.error ?? "failed"}`)}
            onRetry={search.error === "invalid" || search.error === "unauthenticated" || search.error === "rateLimited" ? undefined : () => void runSearch(search.query)} />
        </div>
          : search.items.length === 0 ? <div data-testid="E5.empty"><EmptyState compact title={t("search.empty")} description={t("search.emptyHint")} /></div>
            : <Card padding="none" className="explore-people-list">
              <ul>
                {search.items.map(item => <li key={item.id} data-testid="E5-2-1" className="explore-people-row">
                  <Link to={`/athlete/${item.id}`} className="explore-people-avatar" tabIndex={-1} aria-hidden="true">
                    <Avatar name={item.nickname || t("defaultNickname")} imageUrl={item.photoURL} size="md" />
                  </Link>
                  <span className="explore-people-text">
                    <span className="explore-people-name-line">
                      <Link to={`/athlete/${item.id}`} className="explore-people-name">{item.nickname || t("defaultNickname")}</Link>
                      {!item.profilePublic && <span data-testid="E5-2-6" className="explore-people-private">{t("search.privateProfile")}</span>}
                    </span>
                    {renderBio(item)}
                    {renderSummary(item)}
                    {renderLatest(item)}
                  </span>
                  <span className="explore-people-action">{renderAction(item)}</span>
                </li>)}
              </ul>
            </Card>}
      {search.status === "done" && search.nextCursor && <div className="explore-people-more">
        <Button data-testid="E5-2-4" variant="secondary" loading={search.loadingMore} onClick={() => void loadMore()}>{t("search.more")}</Button>
      </div>}
    </section>}
  </div>;
}
