import "../../pages/ExploreAthletesPage.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useToast } from "../../contexts/ToastContext";
import { useLocale } from "../../contexts/LocaleContext";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { getSportLabelKey } from "../../utils/sportType";
import Avatar from "../../components/Avatar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card, Text } from "../../theme/components";
import { formatDistance } from "../../utils/units";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../../config/activitySubscriptions";
import {
  searchUsers, userSearchErrorKind,
  type SearchUserItem, type UserSearchErrorKind,
} from "../../services/userSearch";
import type { FriendRequestActions } from "./useFriendRequestActions";

interface SearchState {
  query: string;
  status: "loading" | "done" | "error";
  items: SearchUserItem[];
  nextCursor: string | null;
  error: UserSearchErrorKind | null;
  loadingMore: boolean;
}

/**
 * 사람 검색 결과 목록(행·친구 요청 버튼·더 보기). 로그인한 사용자에게만 그린다 — 호출부가 확인한다.
 * `query` 가 비면 아무것도 조회하지 않는다. 같은 검색어로 다시 찾으려면 `searchKey` 를 바꾼다.
 * 탐색 > 사람(ExploreAthletesPage)과 앱 탐색 커뮤니티의 「라이더」 묶음이 같이 쓴다.
 */
export function AthleteSearchResults({ query, searchKey = 0, actions, via }: {
  query: string;
  searchKey?: number;
  actions: FriendRequestActions;
  /** friend_request_send 분석 이벤트의 via */
  via: string;
}) {
  const services = useFirebaseServices();
  const { t } = useTranslation("friends");
  const { t: commonT, i18n } = useTranslation("common");
  const { units } = useLocale();
  const { showToast } = useToast();
  const [search, setSearch] = useState<SearchState | null>(null);
  const epoch = useRef(0);

  const runSearch = useCallback(async (value: string) => {
    const request = ++epoch.current;
    setSearch({ query: value, status: "loading", items: [], nextCursor: null, error: null, loadingMore: false });
    try {
      const result = await searchUsers(value, null, services);
      if (request !== epoch.current) return;
      setSearch({ query: value, status: "done", items: result.items, nextCursor: result.nextCursor, error: null, loadingMore: false });
    } catch (error) {
      if (request !== epoch.current) return;
      setSearch({ query: value, status: "error", items: [], nextCursor: null, error: userSearchErrorKind(error), loadingMore: false });
    }
  }, [services]);

  useEffect(() => {
    if (!query) {
      epoch.current += 1;
      setSearch(null);
      return;
    }
    void runSearch(query);
  }, [query, searchKey, runSearch]);

  const loadMore = async () => {
    if (!search || search.status !== "done" || !search.nextCursor || search.loadingMore) return;
    const request = epoch.current;
    const { query: current, nextCursor } = search;
    setSearch(previous => previous && { ...previous, loadingMore: true });
    try {
      const result = await searchUsers(current, nextCursor, services);
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

  if (!search) return null;

  const renderAction = (item: SearchUserItem) => {
    const state = actions.friendState(item.id);
    const action = actions.pending.get(item.id);
    const name = item.nickname || t("defaultNickname");
    if (state === "friend") {
      return <Button data-testid="E5-2-2" variant="secondary" size="sm" disabled>{t("search.action.friend")}</Button>;
    }
    if (state === "received") {
      return <Button data-testid="E5-2-2" size="sm" loading={action === "accept"} aria-label={t("acceptNamed", { name })}
        onClick={() => void actions.accept(item)}>{t("accept")}</Button>;
    }
    if (state === "sent") {
      return <span className="explore-people-sent">
        <Text variant="caption" tone="secondary">{t("search.action.sent")}</Text>
        <Button data-testid="E5-2-3" variant="ghost" size="sm" disabled={!!action} loading={action === "cancel"}
          aria-label={t("search.action.cancelNamed", { name })} onClick={() => void actions.cancel(item)}>{t("cancelRequest")}</Button>
      </span>;
    }
    if (!item.friendRequestsAllowed) return null;
    return <Button data-testid="E5-2-2" size="sm" disabled={!!action} aria-label={t("search.action.requestNamed", { name })}
      onClick={() => void actions.send(item, { via, matched_by: item.matchedBy })}>{t("search.action.request")}</Button>;
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
        {/* 비공개 프로필의 친구 코드는 친구 코드로 찾은 경우(검색한 사람이 이미 아는 값)에만 보인다(#1891). */}
        {item.friendCode && (item.profilePublic || item.matchedBy === "friendCode") &&
          <span data-testid="E5-2-5" className="explore-people-code">{item.friendCode}</span>}
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

  return <section data-testid="E5-2" aria-label={t("search.resultsLabel")} aria-live="polite" aria-busy={search.status === "loading"}>
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
      <Button size="sm" data-testid="E5-2-4" variant="secondary" loading={search.loadingMore} onClick={() => void loadMore()}>{t("search.more")}</Button>
    </div>}
  </section>;
}
