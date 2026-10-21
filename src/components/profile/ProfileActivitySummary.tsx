import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readOwnProfileActivitySummary } from "../../services/profileActivitySummary";
import { logClientError } from "../../services/errorLogger";
import { LocalizedLink as Link } from "../LocalizedLink";
import InfoTip from "../InfoTip";
import { Button, Text } from "../../theme/components";

type Summary = Awaited<ReturnType<typeof readOwnProfileActivitySummary>>;
export default function ProfileActivitySummary({ uid }: { uid: string }) {
  const { t, i18n } = useTranslation("common");
  const [result, setResult] = useState<{ uid: string; summary: Summary | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void readOwnProfileActivitySummary(uid).then(summary => { if (active) setResult({ uid, summary }); })
      .catch(error => { if (active) { logClientError("profile.activitySummary", error, {}); setResult({ uid, summary: null }); } });
    return () => { active = false; };
  }, [uid, attempt]);
  const current = result?.uid === uid ? result : null;
  const summary = current?.summary;
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";
  return <div className="profile-activity-summary">
    <div className="profile-latest-activity">
      <Text as="h3" variant="bodySmall" tone="secondary">{t("profileSocial.latest")}</Text>
      {!current ? <Text as="p" variant="bodySmall">{t("label.loadingHint")}</Text>
        : summary?.latest ? <Link to={`/activity/${summary.latest.id}`} className="profile-latest-link">
          <Text as="strong" variant="bodySmall">{summary.latest.description?.trim() || t("label.ride")}</Text>
          <span aria-hidden="true">·</span>
          <Text as="span" variant="bodySmall" tone="secondary">{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(summary.latest.startTime)}</Text>
        </Link> : <Text as="p" variant="bodySmall" tone="secondary">{summary?.latestComplete ? t("profileSocial.noActivities") : t("profileSocial.activityUnavailable")}</Text>}
    </div>
    <div className="profile-streak">
      <Text as="h3" variant="bodySmall" tone="secondary" className="profile-streak-heading">
        <InfoTip title={t("profileSocial.streak")} label={t("profileSocial.streak")} content={t("profileSocial.streakWindow")}>{t("profileSocial.streak")}</InfoTip>
      </Text>
      <Text as="strong" variant="num">{!current ? "…" : summary?.weeksCount != null
        ? t(summary.atLeast ? "profileSocial.weeksAtLeast" : "profileSocial.weeks", { count: summary.weeksCount }) : "—"}</Text>
      {summary && <div className="profile-week" role="list" aria-label={t("profileSocial.thisWeek")}>
        {summary.week.map(day => <div key={day.timestamp} role="listitem" className={`profile-week-day${day.active ? " profile-week-day--active" : ""}`}
          aria-current={day.today ? "date" : undefined} aria-label={`${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(day.timestamp)} ${t(day.future ? "profileSocial.futureDay" : day.active == null ? "profileSocial.unknownDay" : day.active ? "profileSocial.activeDay" : "profileSocial.restDay")}`}>
          <span>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "Asia/Seoul" }).format(day.timestamp)}</span>
          <strong>{new Date(day.timestamp + 9 * 3600000).getUTCDate()}</strong>
          <span aria-hidden="true">{day.active ? "●" : day.active == null ? "?" : "·"}</span>
        </div>)}
      </div>}
    </div>
    {summary?.limited && <Text as="p" variant="bodySmall" tone="secondary">{t("profileSocial.limited")}</Text>}
    {current && (!summary || !summary.latestComplete) && <div className="profile-social-error">
      <Text as="p" variant="bodySmall" tone="secondary">{t("profileSocial.activityUnavailable")}</Text>
      <Button variant="ghost" size="sm" onClick={() => setAttempt(value => value + 1)}>{t("profileSocial.retry")}</Button>
    </div>}
  </div>;
}
