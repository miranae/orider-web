import { useState } from "react";
import { CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import type { ClubCafeSchedule, CafeScheduleEntry } from "@shared/clubCafeSchedule";
import { Button, Card, Chip, ToggleButton, ToggleControls, Text } from "../../theme/components";
import { calendarDays, groupCafeDates, meetingToday, shiftMonth } from "./cafeCalendar";
import "./meetingSchedule.css";

const copy = {
  ko: { title: "네이버 카페 라이딩 일정", list: "목록", calendar: "달력", view: "일정 보기 방식", today: "오늘", previous: "이전 달", next: "다음 달", monthAll: "이달 전체", empty: "표시할 모임이 없어요.", timezone: "한국 시간 (KST)", partial: "최근 게시글 50개씩 확인한 일정입니다. 더 오래된 글은 카페에서 확인하세요.", status: { open: "모집 중", waitlist: "대기 접수", closed: "모집 마감", cancelled: "모임 취소", finished: "종료", live: "진행 중", departed: "출발 시각 지남" } },
  en: { title: "Naver cafe rides", list: "List", calendar: "Calendar", view: "Schedule view", today: "Today", previous: "Previous month", next: "Next month", monthAll: "Whole month", empty: "No meetings to show.", timezone: "Korea time (KST)", partial: "Schedules from the latest 50 posts per board. Check the cafe for older posts.", status: { open: "Open", waitlist: "Waitlist", closed: "Closed", cancelled: "Cancelled", finished: "Finished", live: "Live", departed: "Departure time passed" } },
};
interface Props { schedule: ClubCafeSchedule; language: string }
export default function MeetingSchedule({ schedule, language }: Props) {
  const c = copy[language.startsWith("en") ? "en" : "ko"];
  const locale = language.startsWith("en") ? "en-US" : "ko-KR";
  const today = meetingToday();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const grouped = groupCafeDates(schedule.entries);
  const byDate = new Map(grouped);
  const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00+09:00`).toLocaleDateString(locale, { ...options, timeZone: "Asia/Seoul" });
  const visible = view === "list" ? grouped.filter(([date]) => date >= today) : grouped.filter(([date]) => selected ? date === selected : date.startsWith(month));
  const move = (offset: number) => { setMonth(shiftMonth(month, offset)); setSelected(null); };
  const meetingCard = (item: CafeScheduleEntry) => <Card key={item.id} padding="compact">
    <div className="club-schedule__card-heading"><Text as="span" variant="label">{item.boardName}</Text>{(item.closed || item.cancelled) && <Chip variant={item.cancelled ? "danger" : "default"}>{item.cancelled ? c.status.cancelled : c.status.closed}</Chip>}</div>
    <a className="club-schedule__title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
    <Text as="p" variant="caption" tone="secondary">{item.author} · {language.startsWith("en") ? `Comments ${item.commentCount}` : `댓글 ${item.commentCount}`}</Text>
  </Card>;
  return <div className="club-schedule">
    <header className="club-schedule__heading"><div><Text as="h2" variant="title">{c.title}</Text><Text as="p" variant="caption" tone="secondary">{c.timezone}</Text></div>
      <ToggleControls variant="axis" aria-label={c.view}>
        <ToggleButton selected={view === "list"} onClick={() => setView("list")} leadingIcon={<List />}>{c.list}</ToggleButton>
        <ToggleButton selected={view === "calendar"} onClick={() => setView("calendar")} leadingIcon={<CalendarDays />}>{c.calendar}</ToggleButton>
      </ToggleControls>
    </header>
    <Text as="p" variant="bodySmall" tone="secondary">{language.startsWith("en") ? "View details and sign up in the cafe." : "상세 안내와 참가 신청은 카페 원문에서 확인하세요."} <a href={schedule.cafeUrl} target="_blank" rel="noopener noreferrer">{language.startsWith("en") ? "Open cafe" : "카페 바로가기"}</a></Text>
    <Text as="p" variant="caption" tone="secondary">{language.startsWith("en") ? "Last synced" : "최근 동기화"} · {new Date(schedule.syncedAt).toLocaleString(locale, {timeZone: "Asia/Seoul"})}{Date.now() - schedule.syncedAt > 90 * 60 * 1000 ? (language.startsWith("en") ? " · Update delayed" : " · 업데이트 지연") : ""}</Text>
    {schedule.truncated && <Text as="p" variant="bodySmall" tone="secondary" role="status">{c.partial}</Text>}
    {view === "calendar" && <>
      <div className="club-schedule__heading"><Text as="h3" variant="subtitle" aria-live="polite">{dateLabel(`${month}-01`, { year: "numeric", month: "long" })}</Text><div className="club-schedule__navigation">
        <Button variant="ghost" size="sm" aria-label={c.previous} onClick={() => move(-1)} leadingIcon={<ChevronLeft />} />
        <Button variant="secondary" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>{c.today}</Button>
        <Button variant="ghost" size="sm" aria-label={c.next} onClick={() => move(1)} leadingIcon={<ChevronRight />} />
      </div></div>
      <div className="club-schedule__calendar" role="group" aria-label={c.calendar}>
        {Array.from({ length: 7 }, (_, day) => <Text key={`weekday-${day}`} className="club-schedule__weekday" as="span" variant="caption" tone="secondary">{dateLabel(`2026-10-${String(25 + day).padStart(2, "0")}`, { weekday: "short" })}</Text>)}
        {calendarDays(month).map((date, index) => {
          const dayMeetings = date ? byDate.get(date) ?? [] : [];
          return <div key={date ?? `blank-${index}`} className="club-schedule__day" data-today={date === today || undefined} data-selected={date === selected || undefined}>
            {date && <><Button variant={date === selected ? "primary" : "ghost"} size="sm" block aria-label={`${dateLabel(date, { month: "long", day: "numeric", weekday: "long" })}${dayMeetings.length ? ` · ${dayMeetings.length}${language.startsWith("en") ? " rides" : "개 일정"}` : ""}`} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} onClick={() => setSelected(date)}>{Number(date.slice(-2))}</Button>
              {dayMeetings.length > 0 && <><span className="club-schedule__count">{dayMeetings.length}</span><div className="club-schedule__previews">{dayMeetings.slice(0, 2).map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" title={item.title}>{item.title}</a>)}{dayMeetings.length > 2 && <Text as="span" variant="caption">+{dayMeetings.length - 2}</Text>}</div></>}
            </>}
          </div>;
        })}
      </div>
      <div className="club-schedule__heading"><Text as="h3" variant="subtitle">{selected ? dateLabel(selected, { month: "long", day: "numeric", weekday: "long" }) : c.monthAll}</Text>{selected && <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>{c.monthAll}</Button>}</div>
    </>}
    {schedule.undatedCount > 0 && <Text as="p" variant="caption" tone="secondary">{language.startsWith("en") ? `${schedule.undatedCount} posts have no clear date. Check the cafe.` : `날짜를 확인하지 못한 글 ${schedule.undatedCount}개는 카페에서 확인하세요.`}</Text>}
    <div className="club-schedule__agenda" aria-live="polite">{visible.length === 0 ? <Text as="p" tone="secondary">{c.empty}</Text> : visible.map(([date, items]) => <section className="club-schedule__date-group" key={date} aria-label={date}>
      <div className="club-schedule__date"><Text as="h3" variant="subtitle"><time dateTime={date}>{dateLabel(date, { month: "long", day: "numeric", weekday: "short" })}</time></Text>{date === today && <Chip variant="accent">{c.today}</Chip>}</div>
      <div className="club-schedule__meetings">{items.map(meetingCard)}</div>
    </section>)}</div>
  </div>;
}
