import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useMyGroups, useGroupMemberRole } from "../../hooks/useGroup";
import { useGroupPosts } from "../../hooks/useGroupPosts";
import { useClubUpcomingEvents } from "../../hooks/useClubUpcomingEvents";
import { localeTag } from "../../utils/localeDate";
import { Button, Card, Chip, Select, Text } from "../../theme/components";
import type { Group } from "@shared/types";

/**
 * 소식 > "현재 동호회" 관계 범위 (SNS P0).
 *
 * 기존 source 두 가지만 읽는다 — 그룹 소식(groups/{id}/posts)과 다가오는 모임(OPEN/LIVE 최대 5건).
 * 새 club 활동 feed·추천·알림이 아니며, 범위 전환은 어떤 공개 설정도 바꾸지 않는다.
 * source 별 loading / error / 0건을 따로 그려 "조회 실패"를 "없음"으로 단정하지 않는다.
 */

function formatEventTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function SourceSection({ title, loading, error, empty, emptyLabel, onRetry, children }: {
  title: string;
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyLabel: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("dashboard");
  let body: ReactNode;
  if (loading) {
    body = <Text as="p" variant="bodySmall" tone="tertiary" role="status">{t("feed.loading")}</Text>;
  } else if (error) {
    body = (
      <div role="alert" className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
        <Text as="p" variant="bodySmall" tone="danger">{t("feed.club.error")}</Text>
        <Button size="sm" variant="secondary" onClick={onRetry}>{t("feed.error.retry")}</Button>
      </div>
    );
  } else if (empty) {
    body = <Text as="p" variant="bodySmall" tone="tertiary">{emptyLabel}</Text>;
  } else {
    body = <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>{children}</ul>;
  }
  return (
    <Card>
      <Text as="h3" variant="eyebrow" tone="tertiary" style={{ marginBottom: "var(--space-2)" }}>{title}</Text>
      {body}
    </Card>
  );
}

function ClubFeed({ group }: { group: Group }) {
  const { t } = useTranslation("dashboard");
  const { t: tg } = useTranslation("group");
  const posts = useGroupPosts(group.id);
  const events = useClubUpcomingEvents(group.id);
  const locale = localeTag();

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <SourceSection
        title={t("feed.club.posts")}
        loading={posts.loading}
        error={posts.error}
        empty={posts.posts.length === 0}
        emptyLabel={t("feed.club.noPosts")}
        onRetry={posts.retry}
      >
        {posts.posts.slice(0, 5).map((post) => (
          <li key={post.id} className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            {post.kind === "announcement" && <Chip variant="accent" className="self-start">{tg("dashboard.posts.announcement")}</Chip>}
            <Text as="span" variant="body" tone="primary">
              <Link to={`/group/${group.id}`}>{post.content}</Link>
            </Text>
            {post.authorName && <Text as="span" variant="caption" tone="tertiary">{post.authorName}</Text>}
          </li>
        ))}
      </SourceSection>

      <SourceSection
        title={t("feed.club.events")}
        loading={events.loading}
        error={events.error}
        empty={events.events.length === 0}
        emptyLabel={t("feed.club.noEvents")}
        onRetry={events.retry}
      >
        {events.events.map((event) => (
          <li key={event.id} className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            <Text as="span" variant="body" tone="primary">
              <Link to={`/event/${event.id}`}>{event.name || tg("dashboard.fallbackEventName")}</Link>
            </Text>
            {event.startTime > 0 && (
              <Text as="span" variant="caption" tone="tertiary" mono>{formatEventTime(event.startTime, locale)}</Text>
            )}
          </li>
        ))}
      </SourceSection>

      <Link to={`/group/${group.id}`} className="inline-flex items-center self-start" style={{ color: "var(--lime)", fontSize: "var(--fs-sm)", fontWeight: 600, gap: "var(--space-1)" }}>
        {t("feed.club.open")} <ChevronRight size={14} aria-hidden />
      </Link>
    </div>
  );
}

function RoleChip({ group, uid }: { group: Group; uid: string }) {
  const { t } = useTranslation("dashboard");
  const { t: tg } = useTranslation("group");
  const { role, loading } = useGroupMemberRole(group.id, uid);
  const label = group.creatorId === uid
    ? tg("members.role.leader")
    : loading
      ? t("feed.club.roleUnknown")
      : role
        ? tg(`members.role.${role === "co-leader" ? "coLeader" : role}`)
        : null;
  return label ? <Chip>{label}</Chip> : null;
}

export default function ClubScopeFeed({ uid, clubId, onClubChange }: { uid: string; clubId?: string; onClubChange: (id: string, replace?: boolean) => void }) {
  const { t } = useTranslation("dashboard");
  const { groups, loading, error, retry } = useMyGroups(uid);

  // URL 에 동호회가 없을 때만 첫 동호회로 정규화(히스토리는 남기지 않음). 명시된 club= 은
  // 목록 일부 조회 실패로 빠졌을 수 있어 덮어쓰지 않고, 화면만 첫 동호회로 대체 표시한다.
  useEffect(() => {
    if (!loading && !error && groups[0] && !clubId) onClubChange(groups[0].id, true);
  }, [loading, error, groups, clubId, onClubChange]);

  if (loading) return <Text as="p" variant="bodySmall" tone="tertiary" role="status">{t("feed.loading")}</Text>;
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
        <Text as="p" variant="bodySmall" tone="danger">{t("feed.club.error")}</Text>
        <Button size="sm" variant="secondary" onClick={retry}>{t("feed.error.retry")}</Button>
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <Card>
        <Text as="p" variant="body" tone="secondary" style={{ marginBottom: "var(--space-3)" }}>{t("feed.club.noClubs")}</Text>
        <div className="flex flex-wrap" style={{ gap: "var(--space-3)" }}>
          <Link to="/events" style={{ color: "var(--lime)" }}>{t("feed.club.findEvents")}</Link>
          <Link to="/groups" style={{ color: "var(--lime)" }}>{t("feed.club.findClubs")}</Link>
          <Link to="/log" style={{ color: "var(--lime)" }}>{t("feed.club.myTraining")}</Link>
        </div>
      </Card>
    );
  }
  const group = groups.find((item) => item.id === clubId) ?? groups[0];
  if (!group) return null;
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
        <Select
          aria-label={t("feed.club.select")}
          value={group.id}
          onChange={(event) => onClubChange(event.target.value)}
          style={{ flex: "1 1 220px", minWidth: 0 }}
        >
          {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <RoleChip key={group.id} group={group} uid={uid} />
      </div>
      <ClubFeed key={group.id} group={group} />
    </div>
  );
}
