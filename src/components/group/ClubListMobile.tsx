import { useTranslation } from "react-i18next";
import type { Group } from "@shared/types";
import type { NextEventInfo } from "../../hooks/useGroupNextEvents";
import { localeTag } from "../../utils/localeDate";
import { LocalizedLink as Link } from "../LocalizedLink";
import { buttonClass } from "../../theme/components";
import { clubBadgeLabel } from "./GroupCard";

/** 휴대폰 클럽 목록 맨 위에 두는 모임 수 — 내 클럽들의 다음 모임 중 가까운 순. */
export const UPCOMING_MEETING_LIMIT = 3;

function meetingTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString(localeTag(), { weekday: "short", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * 다가오는 모임 — 클럽 카드가 이미 읽는 "다음 모임"(클럽당 1건)만 모아 날짜순으로 보인다. 새 조회는 없다.
 * 참여 여부는 이 목록에서 읽지 않으므로 참여 버튼은 모임(이벤트) 상세로 데려가고, 신청은 상세가 처리한다.
 */
export function UpcomingClubMeetings({ events, groups }: { events: NextEventInfo[]; groups: Pick<Group, "id" | "name">[] }) {
  const { t } = useTranslation("group");
  const names = new Map(groups.map((group) => [group.id, group.name]));
  const rows = events.filter((event) => names.has(event.groupId))
    .sort((a, b) => (a.startTime || Number.MAX_SAFE_INTEGER) - (b.startTime || Number.MAX_SAFE_INTEGER))
    .slice(0, UPCOMING_MEETING_LIMIT);
  if (!rows.length) return null;
  return (
    <section data-testid="C0-5" aria-labelledby="club-upcoming-title" className="club-m-section">
      <h2 id="club-upcoming-title" className="club-m-section__title">{t("list.upcomingMeetings")}</h2>
      <ul className="club-m-list">
        {rows.map((event) => {
          const to = event.meeting ? `/club/${event.groupId}/meetings/${event.id}` : `/event/${event.id}`;
          return (
            <li key={event.id} className="club-m-row" data-testid="C0-5-1">
              <Link to={to} className="club-m-row__main">
                {event.startTime > 0 && <span className="club-m-row__meta">{meetingTime(event.startTime)}</span>}
                <span className="club-m-row__title">{event.name}</span>
                <span className="club-m-row__meta">
                  {names.get(event.groupId)}
                  {event.registered != null ? ` · ${t("list.upcomingParticipants", { count: event.registered })}` : ""}
                </span>
              </Link>
              <Link data-testid="C0-5-2" to={to} className={buttonClass({ variant: "primary", size: "sm", touchHeight: true, className: "club-m-row__action" })}>{t("list.upcomingJoin")}</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 내 클럽 — 이름과 멤버 수만 담은 행 목록. 행을 누르면 클럽 상세로 간다. */
export function MyClubRows({ groups }: { groups: (Pick<Group, "id" | "name"> & Partial<Group>)[] }) {
  const { t } = useTranslation("group");
  return (
    <ul className="club-m-list">
      {groups.map((group) => (
        <li key={group.id}>
          <Link data-testid="C0-1-2" to={`/club/${group.id}`} className="club-m-row club-m-row--link">
            <span aria-hidden="true" className="club-m-badge">{clubBadgeLabel(group)}</span>
            <span className="club-m-row__main">
              <span className="club-m-row__name">{group.name}</span>
              {typeof group.memberCount === "number" && Number.isFinite(group.memberCount) && group.memberCount >= 0 &&
                <span className="club-m-row__meta">{t("card.memberCount", { count: group.memberCount })}</span>}
            </span>
            <span aria-hidden="true" className="club-m-row__chevron">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
